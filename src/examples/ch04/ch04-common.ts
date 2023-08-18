import vert_shader from './shader-vert.wgsl';
import frag_shader from './shader-frag.wgsl';
import * as ws from  'webgpu-simplified';
import { mat4 } from 'gl-matrix';

export const createPipeline = async (init: ws.IWebGPUInit, data: any): Promise<ws.IPipeline> => {
    // pipeline for shape
    const descriptor = ws.createRenderPipelineDescriptor({
        init,
        vsShader: vert_shader,
        fsShader: frag_shader,
        buffers: ws.setVertexBuffers(['float32x3', 'float32x3']),
    })
    const pipeline = await init.device.createRenderPipelineAsync(descriptor);

    // pipeline for wireframe
    const descriptor2 = ws.createRenderPipelineDescriptor({
        init,
        primitiveType: 'line-list',
        vsShader: vert_shader,
        fsShader: frag_shader,
        buffers: ws.setVertexBuffers(['float32x3', 'float32x3']),
    })
    const pipeline2 = await init.device.createRenderPipelineAsync(descriptor2);

    // create vertex and index buffers
    const positionBuffer = ws.createBufferWithData(init.device, data.positions);
    const normalBuffer = ws.createBufferWithData(init.device, data.normals);
    const indexBuffer = ws.createBufferWithData(init.device, data.indices);
    const indexBuffer2 = ws.createBufferWithData(init.device, data.indices2);

    // uniform buffer for model-matrix, vp-matrix, and normal-matrix
    const  uniformBuffer = ws.createBuffer(init.device, 192);

    // light uniform buffers for shape and wireframe
    const  lightUniformBuffer = ws.createBuffer(init.device, 64);
    const  lightUniformBuffer2 = ws.createBuffer(init.device, 64);

    // uniform buffer for material
    const materialUniformBuffer = ws.createBuffer(init.device, 16);
    
    // uniform bind group for vertex shader
    const vertBindGroup = ws.createBindGroup(init.device, pipeline.getBindGroupLayout(0), [uniformBuffer]);
    const vertBindGroup2 = ws.createBindGroup(init.device, pipeline2.getBindGroupLayout(0), [uniformBuffer]);

    // uniform bind group for fragment shader
    const fragBindGroup = ws.createBindGroup(init.device, pipeline.getBindGroupLayout(1), 
        [lightUniformBuffer, materialUniformBuffer]);
    const fragBindGroup2 = ws.createBindGroup(init.device, pipeline2.getBindGroupLayout(1), 
        [lightUniformBuffer2, materialUniformBuffer]);

    // create depth view
    const depthTexture = ws.createDepthTexture(init);

    // create texture view for MASS (count = 4)
    const msaaTexture = ws.createMultiSampleTexture(init);
   
    return {
        pipelines: [pipeline, pipeline2],
        vertexBuffers: [positionBuffer, normalBuffer, indexBuffer, indexBuffer2],
        uniformBuffers: [uniformBuffer, lightUniformBuffer, materialUniformBuffer, lightUniformBuffer2],
        uniformBindGroups: [vertBindGroup, fragBindGroup, vertBindGroup2, fragBindGroup2],
        depthTextures: [depthTexture],
        gpuTextures: [msaaTexture],
    };
}

export const draw = (init:ws.IWebGPUInit, p:ws.IPipeline, plotType:string, data:any) => {  
    const commandEncoder =  init.device.createCommandEncoder();
    const descriptor = ws.createRenderPassDescriptor({
        init,
        depthView: p.depthTextures[0].createView(),
        textureView: p.gpuTextures[0].createView(),
    });
    const renderPass = commandEncoder.beginRenderPass(descriptor);
    
    // draw shape
    const drawShape = () => {
        renderPass.setPipeline(p.pipelines[0]);
        renderPass.setVertexBuffer(0, p.vertexBuffers[0]);
        renderPass.setVertexBuffer(1, p.vertexBuffers[1]);
        renderPass.setBindGroup(0, p.uniformBindGroups[0]);
        renderPass.setBindGroup(1, p.uniformBindGroups[1]);
        renderPass.setIndexBuffer(p.vertexBuffers[2], 'uint32');
        renderPass.drawIndexed(data.indices.length);
    }

    // draw wireframe
    const drawWireframe = () => {
        renderPass.setPipeline(p.pipelines[1]);
        renderPass.setVertexBuffer(0, p.vertexBuffers[0]);
        renderPass.setVertexBuffer(1, p.vertexBuffers[1]);
        renderPass.setBindGroup(0, p.uniformBindGroups[2]);
        renderPass.setBindGroup(1, p.uniformBindGroups[3]);
        renderPass.setIndexBuffer(p.vertexBuffers[3], 'uint32');
        renderPass.drawIndexed(data.indices2.length);
    }

    if(plotType === 'wireframeOnly'){
        drawWireframe();
    } else if(plotType === 'shapeOnly'){
        drawShape();
    } else {
        drawShape();
        drawWireframe();
    }

    renderPass.end();
    init.device.queue.submit([commandEncoder.finish()]);
}

export const setLightEyePositions = (device:GPUDevice, p:ws.IPipeline, 
lightPosition:Float32Array, eyePosition:Float32Array) => {
    device.queue.writeBuffer(p.uniformBuffers[1], 0, lightPosition);
    device.queue.writeBuffer(p.uniformBuffers[1], 16, eyePosition);
    device.queue.writeBuffer(p.uniformBuffers[3], 0, lightPosition);
    device.queue.writeBuffer(p.uniformBuffers[3], 16, eyePosition);
}

export const updateViewProjection = (device:GPUDevice, p:ws.IPipeline,
    vpMatrix:mat4, lightPosition:Float32Array, eyePosition:Float32Array ) => {
    device.queue.writeBuffer(p.uniformBuffers[0], 0, vpMatrix as ArrayBuffer);
    device.queue.writeBuffer(p.uniformBuffers[1], 0, lightPosition);
    device.queue.writeBuffer(p.uniformBuffers[1], 16, eyePosition);
    device.queue.writeBuffer(p.uniformBuffers[3], 0, lightPosition);
    device.queue.writeBuffer(p.uniformBuffers[3], 16, eyePosition);
}

export const updateUniformBuffer = (device:GPUDevice,p:ws.IPipeline, 
modelMat:mat4, params:any, lightChanged:boolean) => {
    const normalMat = ws.createNormalMat(modelMat);
    
    // update uniform buffers for transformation
    device.queue.writeBuffer(p.uniformBuffers[0], 64, modelMat as ArrayBuffer);  
    device.queue.writeBuffer(p.uniformBuffers[0], 128, normalMat as ArrayBuffer);  
   
    if(lightChanged){
        // update uniform buffers for light colors
        device.queue.writeBuffer(p.uniformBuffers[1], 32, ws.hex2rgb(params.objectColor));
        device.queue.writeBuffer(p.uniformBuffers[1], 48, ws.hex2rgb(params.specularColor));
        device.queue.writeBuffer(p.uniformBuffers[3], 32, ws.hex2rgb(params.wireframeColor));
        device.queue.writeBuffer(p.uniformBuffers[3], 48, ws.hex2rgb(params.specularColor));

        // update uniform buffer for material
        device.queue.writeBuffer(p.uniformBuffers[2], 0, new Float32Array([
            params.ambient, params.diffuse, params.specular, params.shininess
        ]));
        lightChanged = false;
    }
    return lightChanged;
}

export const updateVertexBuffers = (device:GPUDevice, p:ws.IPipeline, data:any, origNumVertices:number) => {
    const pData = [data.positions, data.normals, data.indices, data.indices2];
    ws.updateVertexBuffers(device, p, pData, origNumVertices);
}