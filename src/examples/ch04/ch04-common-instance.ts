import vert_shader from './shader-instance-vert.wgsl';
import * as ws from 'webgpu-simplified';
import { vec3 } from 'gl-matrix';

export const createPipeline = async (init:ws.IWebGPUInit, data:any, fsShader:string, numObjects:number, 
lightBufferSize:number, materialBufferSize:number): Promise<ws.IPipeline> => {   
    const descriptor = ws.createRenderPipelineDescriptor({
        init,
        vsShader: vert_shader,
        fsShader,  
        buffers: ws.setVertexBuffers(['float32x3', 'float32x3']),
    });
    const pipeline = await init.device.createRenderPipelineAsync(descriptor);
    
    // create vertex and index buffers for cube
    const cubeData = data.cubeData;
    const vertexBuffer = ws.createBufferWithData(init.device, cubeData.positions);
    const normalBuffer = ws.createBufferWithData(init.device, cubeData.normals);
    const indexBuffer = ws.createBufferWithData(init.device, cubeData.indices);

    // create vertex and index buffers for sphere
    const sphereData = data.sphereData;
    const vertexBuffer1 = ws.createBufferWithData(init.device, sphereData.positions);
    const normalBuffer1 = ws.createBufferWithData(init.device, sphereData.normals);
    const indexBuffer1 = ws.createBufferWithData(init.device, sphereData.indices);

    // create vertex and index buffers for torus
    const torusData = data.torusData;
    const vertexBuffer2 = ws.createBufferWithData(init.device, torusData.positions);
    const normalBuffer2 = ws.createBufferWithData(init.device, torusData.normals);
    const indexBuffer2 = ws.createBufferWithData(init.device, torusData.indices);

    // uniform and storage buffers for transform matrix
    const vpUniformBuffer = ws.createBuffer(init.device, 64);
    const modelUniformBuffer = ws.createBuffer(init.device, 64 * numObjects, ws.BufferType.Storage);
    const normalUniformBuffer = ws.createBuffer(init.device, 64 * numObjects, ws.BufferType.Storage);
    const colorUniformBuffer = ws.createBuffer(init.device, 16 * numObjects, ws.BufferType.Storage);

    // uniform buffer for light 
    const lightUniformBuffer = ws.createBuffer(init.device, lightBufferSize);

    // uniform buffer for material
    const materialUniformBuffer = ws.createBuffer(init.device, materialBufferSize);   

    // uniform bind group for vertex shader
    const vertBindGroup = ws.createBindGroup(init.device, pipeline.getBindGroupLayout(0), 
        [vpUniformBuffer, modelUniformBuffer, normalUniformBuffer, colorUniformBuffer]);

    // uniform bind group for fragment shader
    const fragBindGroup = ws.createBindGroup(init.device, pipeline.getBindGroupLayout(1), 
        [lightUniformBuffer, materialUniformBuffer]);

    // create depth view
    const depthTexture = ws.createDepthTexture(init);

    // create texture view for MASS (count = 4)
    const msaaTexture = ws.createMultiSampleTexture(init);

    return {
        pipelines: [pipeline],
        vertexBuffers: [
            vertexBuffer, normalBuffer, indexBuffer,        // cube
            vertexBuffer1, normalBuffer1, indexBuffer1,     // sphere
            vertexBuffer2, normalBuffer2, indexBuffer2,     // torus
        ],
        uniformBuffers: [
            vpUniformBuffer,        // for vertex
            modelUniformBuffer, 
            normalUniformBuffer, 
            colorUniformBuffer, 
            lightUniformBuffer,     // for fragmnet
            materialUniformBuffer      
        ],
        uniformBindGroups: [vertBindGroup, fragBindGroup],
        gpuTextures: [msaaTexture],
        depthTextures: [depthTexture],    
    };
}

export const draw = (init:ws.IWebGPUInit, p:ws.IPipeline, data:any, numShapes:any) => {  
    const commandEncoder =  init.device.createCommandEncoder();   
    const descriptor = ws.createRenderPassDescriptor({
        init,
        depthView: p.depthTextures[0].createView(),
        textureView: p.gpuTextures[0].createView(),
    });
    const renderPass = commandEncoder.beginRenderPass(descriptor);

    renderPass.setPipeline(p.pipelines[0]);
    renderPass.setBindGroup(0, p.uniformBindGroups[0]);
    renderPass.setBindGroup(1, p.uniformBindGroups[1]);

    // draw cubes
    renderPass.setVertexBuffer(0, p.vertexBuffers[0]);
    renderPass.setVertexBuffer(1, p.vertexBuffers[1]);
    renderPass.setIndexBuffer(p.vertexBuffers[2], 'uint32');
    renderPass.drawIndexed(data.cubeData.indices.length, numShapes.cube, 0, 0, 0);

    // draw spheres
    renderPass.setVertexBuffer(0, p.vertexBuffers[3]);
    renderPass.setVertexBuffer(1, p.vertexBuffers[4]);
    renderPass.setIndexBuffer(p.vertexBuffers[5], 'uint32');
    renderPass.drawIndexed(data.sphereData.indices.length, numShapes.sphere, 0, 0, numShapes.cube);

    // draw torus
    renderPass.setVertexBuffer(0, p.vertexBuffers[6]);
    renderPass.setVertexBuffer(1, p.vertexBuffers[7]);
    renderPass.setIndexBuffer(p.vertexBuffers[8], 'uint32');
    renderPass.drawIndexed(data.torusData.indices.length, numShapes.torus, 0, 0, numShapes.cube + numShapes.sphere);

    renderPass.end();
    init.device.queue.submit([commandEncoder.finish()]);
}

export const setModelNormalMatricesAndColors = (device:GPUDevice, p:ws.IPipeline, numObjects:number, translateDefault = true) => {
    const mMat = new Float32Array(16 * numObjects);
    const nMat = new Float32Array(16 * numObjects);
    const cVec = new Float32Array(4 * numObjects);
    
    for( let i = 0; i < numObjects; i++){
        let translation = vec3.fromValues(Math.random() * 35 - 35, Math.random() * 35 - 32, -15 - Math.random() * 50);
        if(!translateDefault){
            translation = vec3.fromValues(Math.random() * 50 - 25, Math.random() * 40 - 18, -30 - Math.random() * 50);
        }
        let rotation = vec3.fromValues(Math.random(), Math.random(), Math.random());
        let scale = vec3.fromValues(1, 1, 1);
        let m = ws.createModelMat(translation, rotation, scale);
        let n = ws.createNormalMat(m);
        mMat.set(m, 16*i);
        nMat.set(n, 16*i);
        cVec.set([Math.random(), Math.random(), Math.random()], 4*i);
    }
    device.queue.writeBuffer(p.uniformBuffers[3], 0, cVec);
    return {mMat, nMat};
}