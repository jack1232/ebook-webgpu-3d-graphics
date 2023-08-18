import frag_shader from './directional-frag.wgsl';
import * as ws from 'webgpu-simplified';
import { getCubeData, getSphereData, getTorusData } from '../../common/vertex-data';
import * as cci from './ch04-common-instance';

export const run = async () => {
    const canvas = document.getElementById('canvas-webgpu') as HTMLCanvasElement;
    const init = await ws.initWebGPU({canvas, msaaCount: 4});

    const NUM_CUBES = 50;
    const NUM_SPHERES = 50;
    const NUM_TORUS = 50;
    const numObjects = NUM_CUBES + NUM_SPHERES + NUM_TORUS;
    const cubeData = getCubeData();
    const sphereData = getSphereData(1.5, 20, 32);
    const torusData = getTorusData(1.5, 0.45, 30, 10);
    const data = {cubeData, sphereData, torusData};

    const p = await cci.createPipeline(init, data, frag_shader, numObjects, 48, 16);

    let vt = ws.createViewTransform([4,4,8]);
    let viewMat = vt.viewMat;

    let aspect = init.size.width / init.size.height;      
    let projectMat = ws.createProjectionMat(aspect);
    let vpMat = ws.combineVpMat(viewMat, projectMat);
    init.device.queue.writeBuffer(p.uniformBuffers[0], 0, vpMat as ArrayBuffer);

    var camera = ws.getCamera(canvas, vt.cameraOptions);
    let eyePosition = new Float32Array(vt.cameraOptions.eye);
    let lightDirection = new Float32Array([-0.2, -1.0, -0.3]);

    // write light parameters to buffer 
    init.device.queue.writeBuffer(p.uniformBuffers[4], 0, lightDirection);
    init.device.queue.writeBuffer(p.uniformBuffers[4], 16, eyePosition);

    var gui = ws.getDatGui();
    document.querySelector('#gui').append(gui.domElement);
    const params = {
        animateSpeed: 1,
        specularColor: '#ffffff',
        ambient: 0.1,
        diffuse: 0.7,
        specular: 0.4,
        shininess: 30,
    };
    
    gui.add(params, 'animateSpeed', 0, 5, 0.01);      
    var folder = gui.addFolder('Set lighting parameters');
    folder.open();
    folder.addColor(params, 'specularColor');
    folder.add(params, 'ambient', 0, 1, 0.02);  
    folder.add(params, 'diffuse', 0, 1, 0.02);  
    folder.add(params, 'specular', 0, 1, 0.02);  
    folder.add(params, 'shininess', 0, 300, 1);  

    const mn =  cci.setModelNormalMatricesAndColors(init.device, p, numObjects);

    var stats = ws.getStats();
    let start = performance.now();
    const frame = () => {    
        stats.begin();  

        projectMat = ws.createProjectionMat(aspect);
        if(camera.tick()){
            viewMat = camera.matrix;
            vpMat = ws.combineVpMat(viewMat, projectMat);
            eyePosition = new Float32Array(camera.eye.flat());
            init.device.queue.writeBuffer(p.uniformBuffers[0], 0, vpMat as ArrayBuffer);
            init.device.queue.writeBuffer(p.uniformBuffers[4], 0, lightDirection);
            init.device.queue.writeBuffer(p.uniformBuffers[4], 16, eyePosition);
        }
       
        // update uniform buffers for transformation 
        init.device.queue.writeBuffer(p.uniformBuffers[1], 0, mn.mMat);  
        init.device.queue.writeBuffer(p.uniformBuffers[2], 0, mn.nMat);  

        // update uniform buffers for light direction and colors
        let dt = (performance.now() - start)/1000;
        let sn = 10 * (0.5 + Math.sin(params.animateSpeed*dt));
        let cn = 10 * (0.5 + Math.cos(params.animateSpeed*dt));        
        init.device.queue.writeBuffer(p.uniformBuffers[4], 0, Float32Array.of(-0.2*sn, -0.3*cn, -1));
        init.device.queue.writeBuffer(p.uniformBuffers[4], 32, ws.hex2rgb(params.specularColor));

        // update material uniform buffer
        init.device.queue.writeBuffer(p.uniformBuffers[5], 0, Float32Array.of(
            params.ambient, params.diffuse, params.specular, params.shininess
        ));

        const numShapes = {
            cube: NUM_CUBES,
            sphere: NUM_SPHERES,
            torus: NUM_TORUS,
        }
        cci.draw(init, p, data, numShapes);   
        
        requestAnimationFrame(frame);
        stats.end();
    };
    frame();
}

run();