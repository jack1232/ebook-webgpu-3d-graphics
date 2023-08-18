import * as ws from  'webgpu-simplified';
import { getCubeData } from '../../common/vertex-data';
import * as cc from './ch04-common';
import { vec3, mat4 } from 'gl-matrix';

const run = async () => {
    const canvas = document.getElementById('canvas-webgpu') as HTMLCanvasElement;
    const init = await ws.initWebGPU({canvas, msaaCount: 4});

    const data = getCubeData();
    const p = await cc.createPipeline(init, data);
   
    let modelMat = mat4.create();
    let vt = ws.createViewTransform();
    let viewMat = vt.viewMat;

    let aspect = init.size.width / init.size.height;  
    let rotation = vec3.fromValues(0, 0, 0);    
    let projectMat = ws.createProjectionMat(aspect);
    let vpMat = ws.combineVpMat(viewMat, projectMat);
    init.device.queue.writeBuffer(p.uniformBuffers[0], 0, vpMat as ArrayBuffer);

    let camera = ws.getCamera(canvas, vt.cameraOptions);     
    let eyePosition = new Float32Array(vt.cameraOptions.eye);
    let lightPosition = eyePosition;

    // write light parameters to buffer 
    cc.setLightEyePositions(init.device, p, lightPosition, eyePosition);
    
    var gui = ws.getDatGui();
    document.querySelector('#gui').append(gui.domElement);
    const params = {
        rotationSpeed: 0.9,
        objectColor: '#ff0000',
        wireframeColor: '#ffff00',
        plotType: 'shapeAndWireframe',

        specularColor: '#ffffff',
        ambient: 0.2,
        diffuse: 0.8,
        specular: 0.4,
        shininess: 30,
    };
    let lightChanged = true;
       
    gui.add(params, 'rotationSpeed', 0, 5, 0.1);      
    gui.addColor(params, 'objectColor').onChange(()=>{ lightChanged = true; });
    gui.addColor(params, 'wireframeColor').onChange(()=>{ lightChanged = true; });
    gui.add(params, 'plotType', ['shapeAndWireframe', 'shapeOnly', 'wireframeOnly']);

    var folder = gui.addFolder('Set lighting parameters');
    folder.open();
    folder.add(params, 'ambient', 0, 1, 0.02).onChange(()=>{ lightChanged = true; });  
    folder.add(params, 'diffuse', 0, 1, 0.02).onChange(()=>{ lightChanged = true; });  
    folder.addColor(params, 'specularColor').onChange(()=>{ lightChanged = true; });
    folder.add(params, 'specular', 0, 1, 0.02).onChange(()=>{ lightChanged = true; });  
    folder.add(params, 'shininess', 0, 300, 1).onChange(()=>{ lightChanged = true; });  

    var stats = ws.getStats();
    let start = Date.now();
    const frame = () => {  
        stats.begin(); 

        projectMat = ws.createProjectionMat(aspect);
        if(camera.tick()){
            viewMat = camera.matrix;
            vpMat = ws.combineVpMat(viewMat, projectMat);
            eyePosition = new Float32Array(camera.eye.flat());
            lightPosition = eyePosition;
            cc.updateViewProjection(init.device, p, vpMat, lightPosition, eyePosition);
        }
        var dt = (Date.now() - start)/1000;        
        rotation[0] = Math.sin(dt * params.rotationSpeed);
        rotation[1] = Math.cos(dt * params.rotationSpeed); 
        modelMat = ws.createModelMat([0,0,0], rotation);

        lightChanged = cc.updateUniformBuffer(init.device, p, modelMat, params, lightChanged);
        cc.draw(init, p, params.plotType, data); 

        requestAnimationFrame(frame);
        stats.end();
    };
    frame();
}

run();