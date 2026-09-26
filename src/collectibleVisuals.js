import * as THREE from 'three';

const _curve=new THREE.CatmullRomCurve3([
  new THREE.Vector3(-.38,.11,0),
  new THREE.Vector3(-.27,-.035,0),
  new THREE.Vector3(-.08,-.16,0),
  new THREE.Vector3(.16,-.13,0),
  new THREE.Vector3(.36,.085,0)
]);
const _highlightCurve=new THREE.CatmullRomCurve3([
  new THREE.Vector3(-.31,.12,.075),
  new THREE.Vector3(-.20,.005,.082),
  new THREE.Vector3(-.04,-.085,.084),
  new THREE.Vector3(.13,-.07,.08),
  new THREE.Vector3(.28,.07,.073)
]);
const _bodyGeometry=new THREE.TubeGeometry(_curve,32,.108,10,false);
const _highlightGeometry=new THREE.TubeGeometry(_highlightCurve,24,.020,6,false);
const _tipGeometry=new THREE.SphereGeometry(.095,10,8);
const _stemGeometry=new THREE.CylinderGeometry(.038,.052,.17,8);
const _tipMaterial=new THREE.MeshStandardMaterial({color:0x68401d,roughness:.84,metalness:0});
const _highlightMaterial=new THREE.MeshBasicMaterial({color:0xffdf66,transparent:true,opacity:.88,depthWrite:false,toneMapped:false});

export function createBananaVisual(bodyMaterial){
  const root=new THREE.Group();
  const visual=new THREE.Group();
  visual.name='banana-visual-pivot';
  root.add(visual);
  const body=new THREE.Mesh(_bodyGeometry,bodyMaterial);body.castShadow=true;visual.add(body);
  const leftTip=new THREE.Mesh(_tipGeometry,_tipMaterial);leftTip.position.set(-.39,.115,0);leftTip.scale.set(.72,.72,.78);leftTip.castShadow=true;visual.add(leftTip);
  const rightTip=new THREE.Mesh(_tipGeometry,_tipMaterial);rightTip.position.set(.365,.09,0);rightTip.scale.set(.70,.70,.78);rightTip.castShadow=true;visual.add(rightTip);
  const stem=new THREE.Mesh(_stemGeometry,_tipMaterial);stem.position.set(.414,.175,0);stem.rotation.z=-.48;stem.castShadow=true;visual.add(stem);
  const highlight=new THREE.Mesh(_highlightGeometry,_highlightMaterial);highlight.renderOrder=6;visual.add(highlight);
  // Readability comes from warm value contrast and a stable crescent profile,
  // not oversized bloom. Keep the silhouette close to the pickup contract.
  visual.scale.set(1.08,1.08,1.08);
  visual.rotation.x=.15;visual.rotation.z=-.075;
  root.userData.collectibleVisual=visual;
  root.userData.visualRole='reward-path';
  root.userData.readability='warm-unlit-accent-no-bloom';
  return root;
}
