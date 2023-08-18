import vsShader from './shader-instance-vert.wgsl';
import fsShader from '../ch04/directional-frag.wgsl';
import * as ws from 'webgpu-simplified';
import { getSimpleSurfaceData, ISurfaceInput, ISurfaceOutput } from '../../common/surface-data';
import { vec3 } from 'gl-matrix';

const createPipeline = async (init:ws.IWebGPUInit, data: ISurfaceOutput, 
numObjects: number): Promise<ws.IPipeline> => {
    // pipeline for shape
    const descriptor = ws.createRenderPipelineDescriptor({
        init, vsShader, fsShader,
        buffers: ws.setVertexBuffers(['float32x3', 'float32x3', 'float32x3']),//pos, norm, col 
    })
    const pipeline = await init.device.createRenderPipelineAsync(descriptor);

    // pipeline for wireframe
    const descriptor2 = ws.createRenderPipelineDescriptor({
        init, vsShader, fsShader,
        primitiveType: 'line-list',
        buffers: ws.setVertexBuffers(['float32x3', 'float32x3', 'float32x3']),//pos, norm, col 
    })
    const pipeline2 = await init.device.createRenderPipelineAsync(descriptor2);
   
    // create vertex and index buffers
    const positionBuffer = ws.createBufferWithData(init.device, data.positions);
    const normalBuffer = ws.createBufferWithData(init.device, data.normals);
    const colorBuffer = ws.createBufferWithData(init.device, data.colors);
    const colorBuffer2 = ws.createBufferWithData(init.device, data.colors2);
    const indexBuffer = ws.createBufferWithData(init.device, data.indices);
    const indexBuffer2 = ws.createBufferWithData(init.device, data.indices2);

    // uniform buffers for transform matrix
    const vpUniformBuffer = ws.createBuffer(init.device, 64);
    const modelUniformBuffer = ws.createBuffer(init.device, 64*numObjects, ws.BufferType.Storage);
    const normalUniformBuffer = ws.createBuffer(init.device, 64*numObjects, ws.BufferType.Storage);
    
    // uniform buffer for light 
    const lightUniformBuffer = ws.createBuffer(init.device, 48);
   
    // uniform buffer for material
    const materialUniformBuffer = ws.createBuffer(init.device, 16);

    // uniform bind group for vertex shader
    const vertBindGroup = ws.createBindGroup(init.device, pipeline.getBindGroupLayout(0), 
        [vpUniformBuffer, modelUniformBuffer, normalUniformBuffer]);
    const vertBindGroup2 = ws.createBindGroup(init.device, pipeline2.getBindGroupLayout(0), 
        [vpUniformBuffer, modelUniformBuffer, normalUniformBuffer]);
   
    // uniform bind group for fragment shader
    const fragBindGroup = ws.createBindGroup(init.device, pipeline.getBindGroupLayout(1), 
        [lightUniformBuffer, materialUniformBuffer]);
    const fragBindGroup2 = ws.createBindGroup(init.device, pipeline2.getBindGroupLayout(1), 
        [lightUniformBuffer, materialUniformBuffer]);

   // create depth view
   const depthTexture = ws.createDepthTexture(init);

   // create texture view for MASS (count = 4)
   const msaaTexture = ws.createMultiSampleTexture(init);

    return {
        pipelines: [pipeline, pipeline2],
        vertexBuffers: [positionBuffer, normalBuffer, colorBuffer, colorBuffer2, indexBuffer, indexBuffer2],  
        uniformBuffers: [
            vpUniformBuffer,    // for vertex
            modelUniformBuffer,
            normalUniformBuffer,
            lightUniformBuffer,   // for fragment
            materialUniformBuffer      
        ],
        uniformBindGroups: [vertBindGroup, fragBindGroup, vertBindGroup2, fragBindGroup2],
        depthTextures: [depthTexture],
        gpuTextures: [msaaTexture],
    };
}

const draw = (init:ws.IWebGPUInit, p:ws.IPipeline, plotType: string, data: ISurfaceOutput, numObjects: number) => {  
    const commandEncoder =  init.device.createCommandEncoder();       
    const descriptor = ws.createRenderPassDescriptor({
        init,
        depthView: p.depthTextures[0].createView(),
        textureView: p.gpuTextures[0].createView(),
    });
    const renderPass = commandEncoder.beginRenderPass(descriptor);
    
    // draw surface
    function drawSurface() {
        renderPass.setPipeline(p.pipelines[0]);
        renderPass.setVertexBuffer(0, p.vertexBuffers[0]);
        renderPass.setVertexBuffer(1, p.vertexBuffers[1]);
        renderPass.setVertexBuffer(2, p.vertexBuffers[2]);
        renderPass.setBindGroup(0, p.uniformBindGroups[0]);
        renderPass.setBindGroup(1, p.uniformBindGroups[1]);
        renderPass.setIndexBuffer(p.vertexBuffers[4], 'uint32');
        renderPass.drawIndexed(data.indices.length, numObjects);
    }

    // draw wireframe
    function drawWireframe(){
        renderPass.setPipeline(p.pipelines[1]);
        renderPass.setVertexBuffer(0, p.vertexBuffers[0]);
        renderPass.setVertexBuffer(1, p.vertexBuffers[1]);
        renderPass.setVertexBuffer(2, p.vertexBuffers[3]);
        renderPass.setBindGroup(0, p.uniformBindGroups[2]);
        renderPass.setBindGroup(1, p.uniformBindGroups[3]);
        renderPass.setIndexBuffer(p.vertexBuffers[5], 'uint32');
        renderPass.drawIndexed(data.indices2.length, numObjects);
    }

    if(plotType === 'surface'){
        drawSurface();
    } else if(plotType === 'wireframe'){
        drawWireframe();
    } else {
        drawSurface();
        drawWireframe();
    }

    renderPass.end();
    init.device.queue.submit([commandEncoder.finish()]);
}

const run = async () => {
    const canvas = document.getElementById('canvas-webgpu') as HTMLCanvasElement;
    const init = await ws.initWebGPU({canvas, msaaCount: 4});
    const xSegments = 64;
    const zSegments = 64;
    const xNUM = 100;
    const zNUM = 100;
    const numObjects = xNUM * zNUM;

    let isi: ISurfaceInput = {
        surfaceType: 'sinc',
        nu: 64,
        nv: 64, 
        t: 0,
        scale: 0.5,
        colormapName: 'jet',
        wireframeColor: 'white',
        colormapDirection: 1,
    };
    let data = getSimpleSurfaceData(isi);
    let p = await createPipeline(init, data, numObjects);

    var gui =  ws.getDatGui();
    const params = {
        rotationSpeed: 0.9,
        animateSpeed: 1,
        surfaceType: 'sinc',
        wireframeColor: 'white',
        scale: 0.5,
        plotType: 'surface',
        colormap: 'jet',
        colormapDirection: 'y',
        specularColor: '#aaaaaa',
        ambient: 0.1,
        diffuse: 0.7,
        specular: 0.4,
        shininess: 30,
    };
    
    let colormapDirection = 1;
          
    gui.add(params, 'surfaceType', ['peaks', 'poles', 'sinc']);
    gui.add(params, 'animateSpeed', 0, 5, 0.1);     
    gui.add(params, 'rotationSpeed', 0, 5, 0.1);
   
    var folder = gui.addFolder('Set Surface Parameters');
    folder.open();
    folder.add(params, 'scale', 0.1, 5, 0.1); 
    folder.add(params, 'colormap', [
        'autumn', 'bone', 'cool', 'copper', 'greys', 'hsv', 'hot', 'jet', 'rainbow', 'rainbow_soft', 
        'spring', 'summer', 'winter', 'black', 'blue', 'cyan', 'fuchsia', 'green', 'red', 'white',
        'yellow'
    ]); 
    folder.add(params, 'colormapDirection', [
        'x', 'y', 'z'
    ]).onChange((val:string) => {              
        if(val === 'x') colormapDirection = 0;
        else if(val === 'z') colormapDirection = 2;
        else colormapDirection = 1;
    }); 
    folder.add(params, 'wireframeColor', [
        'black', 'blue', 'cyan', 'fuchsia', 'green', 'red', 'white', 'yellow', 'autumn', 'bone', 'cool', 
        'copper', 'greys', 'hsv', 'hot', 'jet', 'rainbow', 'rainbow_soft', 'spring', 'summer', 'winter'
    ]);
    folder.add(params, 'plotType', ['surface', 'wireframe', 'surface_wireframe']);

    folder = gui.addFolder('Set Lighting Parameters');
    folder.open();
    folder.add(params, 'ambient', 0, 1, 0.02);  
    folder.add(params, 'diffuse', 0, 1, 0.02);  
    folder.addColor(params, 'specularColor');
    folder.add(params, 'specular', 0, 1, 0.02);  
    folder.add(params, 'shininess', 0, 300, 1);  

    let vt = ws.createViewTransform([3,4.5,5.2]);
    let viewMat = vt.viewMat;

    let aspect = init.size.width / init.size.height;  
    let projectMat = ws.createProjectionMat(aspect);  
    let vpMat = ws.combineVpMat(viewMat, projectMat);
   
    var camera = ws.getCamera(canvas, vt.cameraOptions);
    let eyePosition = new Float32Array(vt.cameraOptions.eye);
    let lightDirection = new Float32Array([-0.5, -0.5, -0.5]);
    init.device.queue.writeBuffer(p.uniformBuffers[0], 0, vpMat as ArrayBuffer);
    init.device.queue.writeBuffer(p.uniformBuffers[3], 0, lightDirection);
    init.device.queue.writeBuffer(p.uniformBuffers[3], 16, eyePosition);

    const mMat = new Float32Array(16* numObjects);
    const nMat = new Float32Array(16* numObjects);

    let start = performance.now();
    let stats = ws.getStats();

    const frame = () => {     
        stats.begin();

        projectMat = ws.createProjectionMat(aspect); 
        if(camera.tick()){
            viewMat = camera.matrix;
            vpMat = ws.combineVpMat(viewMat, projectMat);
            eyePosition = new Float32Array(camera.eye.flat());
            init.device.queue.writeBuffer(p.uniformBuffers[0], 0, vpMat as ArrayBuffer);
            init.device.queue.writeBuffer(p.uniformBuffers[3], 16, eyePosition);
        }
        var dt = (performance.now() - start)/1000;   
        let ij = 0;
        for(let i = 0; i < xNUM; i++){
            for(let j = 0; j < zNUM; j++){
                let translation = vec3.fromValues(-190 + 2*i, 2, -180 + 2*j);
                let rotation = vec3.fromValues(Math.sin(dt * params.rotationSpeed*i/xNUM), 
                    Math.sin(dt * params.rotationSpeed*j/zNUM), Math.cos(i*j*dt*params.rotationSpeed/numObjects));
                let scale = vec3.fromValues(1, 1, 1);
                let m = ws.createModelMat(translation, rotation, scale);
                let n = ws.createNormalMat(m);
                mMat.set(m, 16*ij);
                nMat.set(n, 16*ij);
                ij++;
            }
        }

        // update uniform buffers for transformation 
        init.device.queue.writeBuffer(p.uniformBuffers[1], 0, mMat as ArrayBuffer);  
        init.device.queue.writeBuffer(p.uniformBuffers[2], 0, nMat as ArrayBuffer);  
       
        // update uniform buffers for specular light color
        init.device.queue.writeBuffer(p.uniformBuffers[3], 32, ws.hex2rgb(params.specularColor));
       
        // update uniform buffer for material
        init.device.queue.writeBuffer(p.uniformBuffers[4], 0, new Float32Array([
            params.ambient, params.diffuse, params.specular, params.shininess
        ]));
        
        // update vertex and index buffers for every frame         
        let dt1 = params.animateSpeed * dt;
        const len0 = data.positions.length;
        isi = {
            surfaceType: params.surfaceType,
            nu: xSegments,
            nv: zSegments, 
            t: dt1,
            scale: params.scale,
            colormapName: params.colormap,
            wireframeColor: params.wireframeColor,
            colormapDirection,
        }
        data = getSimpleSurfaceData(isi);
        const pData = [data.positions, data.normals, data.colors, data.colors2, data.indices, data.indices2];
        ws.updateVertexBuffers(init.device, p, pData, len0);

        draw(init, p, params.plotType, data, numObjects);      
    
        requestAnimationFrame(frame);
        stats.end();
    };
    frame();
}

run();