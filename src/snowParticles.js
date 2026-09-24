// Snow point-sprite spray was deliberately removed from the game.
// Keep the same public API so environment/weather/gameplay code can call it
// without branching, while rendering zero white particle dots.

export function createSnowParticles(){
  let enabled=false;

  const spray=()=>{};
  const update=()=>{};
  const reset=()=>{};
  const setTint=()=>{};
  const setDensity=()=>0;
  const setEnabled=value=>{
    enabled=!!value&&false;
    return enabled;
  };
  const getDiagnostics=()=>({
    disabled:true,
    densityScale:0,
    mistActive:0,
    mistCapacity:0,
    chunksActive:0,
    chunksCapacity:0
  });

  return {
    spray,
    update,
    reset,
    setTint,
    setDensity,
    setEnabled,
    getDiagnostics,
    setDensityMultiplier:setDensity,
    getDensityMultiplier:()=>0
  };
}
