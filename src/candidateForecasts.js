import { GameEngine } from './gameEngine.js';
export const ACTIONS = ['UP','DOWN','LEFT','RIGHT','WAIT'];
const HORIZON_TICKS = 10;
export function snapshot(engine) { return structuredClone(Object.fromEntries(['level','lives','player','obstacles','portals','countdownTimer','fixedDeltaTime','simulationSpeed'].map(k => [k,engine[k]]))); }
export function forecast(state, action, progress = true) {
 const engine = new GameEngine(); Object.assign(engine, structuredClone(state)); engine.persistHighScore = false; engine.state = 'PLAYING'; engine.aiMode = true;
 let death=null,captures=0,accepted=false;
 engine.onDeathOccurred = cause => { death=cause; }; engine.onPortalScore = () => { captures++; };
 engine.queueAIIntent(() => ({action,onAccepted:()=>{accepted=true;}}));
 for(let i=0;i<HORIZON_TICKS && !death && !captures;i++) engine.physicsUpdate(engine.fixedDeltaTime);
 const safe=accepted&&!death; const rowGain=captures?state.player.currPosition.z:state.player.currPosition.z-engine.player.currPosition.z;
 const progressScore=!progress?null:!safe?0:captures?4:rowGain>0?3:forecast(snapshot(engine),'UP',false).safe?2:1;
 return {accepted,safe,death,captures,rowGain,progressScore};
}
export function modelState(state) {
    return {
        rules: {
            objective: 'Survive and reach an empty portal at z=0. Prefer useful forward progress when safe; waiting can allow traffic or logs to align.',
            dtSeconds: state.fixedDeltaTime, hopSpeed: state.player.hopSpeed,
            horizonTicks: HORIZON_TICKS,
            timing: 'The snapshot is immediately before a physics tick. Each tick reduces countdown, moves obstacles, then processes the frog. On the first tick a grounded road collision kills before input. A legal command starts a hop; hop progress starts increasing on the following tick by dt*hopSpeed until >=1. At hopSpeed=8 it lands after eight further ticks. No drift during hopping or on the landing tick. No further commands during the horizon. WAIT remains grounded for all ten ticks.',
            obstacles: 'x += speed*dt on every tick. After moving past x=9.5 to the right, set x=-9.5; after moving past -9.5 to the left, set x=9.5. Speeds are signed units per simulated second.',
            movement: 'UP decreases z by 1 if z>0; DOWN increases z by 1 if z<12; LEFT decreases x by 1 only if current x>-5; RIGHT increases x by 1 only if current x<5. WAIT is always a legal command. An illegal move is not a safe candidate even if the frog survives staying still.',
            roads: 'Rows z=7..11. Grounded/landing collision when abs(frog.x-obstacle.x) <= obstacle.length/2 + 0.20. No airborne collisions.',
            river: 'Rows z=1..5. At landing or while idle, a log must satisfy abs(frog.x-log.x) <= log.length/2 + 0.20 or the frog drowns. When idle, test overlap after log movement then carry frog by log.speed*dt. Carried x outside [-6.5,6.5] is fatal.',
            banks: 'Rows z=12 and z=6 have no traffic or river hazards.',
            portals: 'At z=0, abs(frog.x-portal.x) must be strictly <0.5 and portal must be unfilled; otherwise fatal. Capturing ends the evaluation successfully.',
            timeout: 'Countdown reaching zero is fatal.'
        },
        level: state.level, countdownSeconds: state.countdownTimer,
        player: state.player, obstacles: state.obstacles, portals: state.portals
    };
}


export function supportedState(engine) { const s=snapshot(engine); return {...modelState(s), localCandidatePredictions:Object.fromEntries(ACTIONS.map(a=>[a,forecast(s,a)])), predictionRubric:'Exact local ten-tick simulation: safe requires legal accepted command and no death. progressScore 0=unsafe, 1=survives without forward progress and next UP unsafe, 2=survives without progress and next UP safe, 3=survives and advances, 4=captures portal. World freezes during this request; execution still checks safety.'}; }
