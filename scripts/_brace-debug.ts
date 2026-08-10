import fs from 'node:fs'; import path from 'node:path';
(async()=>{
  const B=await import('@babylonjs/core');
  const {initPhysics,__setHavokWasmBinary}=await import('../lib/babylon/core/Physics');
  const {ContactSystem}=await import('../lib/babylon/core/ContactSystem');
  __setHavokWasmBinary(fs.readFileSync(path.resolve(__dirname,'../node_modules/@babylonjs/havok/lib/umd/HavokPhysics.wasm')));
  for (const brace of [false,true]) {
    const engine=new B.NullEngine(); engine.getDeltaTime=()=>1000/60;
    const scene=new B.Scene(engine);
    new B.ArcRotateCamera('cam',0,0,10,B.Vector3.Zero(),scene);
    await initPhysics(scene);
    const cs=new ContactSystem(); await cs.init(scene);
    const a=new B.TransformNode('a',scene); const b=new B.TransformNode('b',scene);
    a.position.set(-3,0,0); b.position.set(0,0,0);
    cs.addBody('driver',a); cs.addBody('defender',b);
    if (brace) cs.brace('defender',true);
    for (let i=0;i<120;i++){
      cs.drive('driver',new B.Vector3(5,0,0),1/60);
      scene.render();
      if(i%30===0) console.log(brace?'BRACED':'normal',i,'driverX',a.position.x.toFixed(2),'defX',b.position.x.toFixed(2));
    }
    engine.dispose();
  }
})();
