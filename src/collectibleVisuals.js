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

const _bodyGeometry=new THREE.TubeGeometry(_curve,28,.105,9,false);
const _highlightGeometry=new THREE.TubeGeometry(_highlightCurve,20,.018,5,false);
const _tipGeometry=new THREE.SphereGeometry(.095,9,7);
const _stemGeometry=new THREE.CylinderGeometry(.038,.052,.17,7);
const _tipMaterial=new THREE.MeshStandardMaterial({
  color:0x6d441f,
  roughness:.82,
  metalness:0
});
const _highlightMaterial=new THREE.MeshBasicMaterial({
  color:0xfff3a8,
  transparent:true,
  opacity:.78,
  depthWrite:false
});

/**
 * Shared, low-cost collectible mesh. The geometry is deliberately asymmetric
 * and broad in screen space so the pickup reads as a banana instead of a ring.
 */
export function createBananaVisual(bodyMaterial){
  const root=new THREE.Group();

  const body=new THREE.Mesh(_bodyGeometry,bodyMaterial);
  body.castShadow=true;
  root.add(body);

  const leftTip=new THREE.Mesh(_tipGeometry,_tipMaterial);
  leftTip.position.set(-.39,.115,0);
  leftTip.scale.set(.72,.72,.78);
  leftTip.castShadow=true;
  root.add(leftTip);

  const rightTip=new THREE.Mesh(_tipGeometry,_tipMaterial);
  rightTip.position.set(.365,.09,0);
  rightTip.scale.set(.70,.70,.78);
  rightTip.castShadow=true;
  root.add(rightTip);

  const stem=new THREE.Mesh(_stemGeometry,_tipMaterial);
  stem.position.set(.414,.175,0);
  stem.rotation.z=-.48;
  stem.castShadow=true;
  root.add(stem);

  const highlight=new THREE.Mesh(_highlightGeometry,_highlightMaterial);
  highlight.renderOrder=6;
  root.add(highlight);

  root.scale.set(1.17,1.17,1.17);
  root.rotation.z=-.04;
  return root;
}
