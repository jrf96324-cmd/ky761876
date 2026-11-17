/* ===== lib/10-tslot.js：T 槽鋁擠型資料表與斷面 =====
 * PROFILES：s=邊長 mm、slot=槽寬、kg=kg/m、bracket/nut/cap=角座/T螺帽組/端蓋參考單價(NT$)、bolt=螺絲規格
 * 單價為台灣市場參考值，App 端務必讓使用者可修改。
 */
const PROFILES = {
  '2020':{s:20,slot:6, kg:0.50,bracket:12,nut:4,cap:5, bolt:'M5'},
  '3030':{s:30,slot:8, kg:0.85,bracket:18,nut:5,cap:6, bolt:'M6'},
  '4040':{s:40,slot:8, kg:1.45,bracket:25,nut:6,cap:8, bolt:'M8'},
  '4545':{s:45,slot:10,kg:1.90,bracket:30,nut:6,cap:10,bolt:'M8'},
  '5050':{s:50,slot:10,kg:2.30,bracket:35,nut:6,cap:12,bolt:'M8'},
  '6060':{s:60,slot:10,kg:3.00,bracket:45,nut:7,cap:15,bolt:'M8'},
  '8080':{s:80,slot:10,kg:5.20,bracket:70,nut:8,cap:25,bolt:'M8'}
};
/* 斷面外框（逆時針，4 個 T 槽＋倒角），中心孔另加 circ(P*0.11) */
function profilePts(P, slot){
  const h=P/2, o=slot/2, n=P*0.075, cw=Math.min(slot*0.95,P*0.36), cd=P*0.16, c=P*0.04;
  const side=[[-h+c,0],[-o,0],[-o,n],[-cw,n],[-cw,n+cd*0.6],[-o*0.6,n+cd],[o*0.6,n+cd],[cw,n+cd*0.6],[cw,n],[o,n],[o,0],[h-c,0]];
  const pts=[];
  for(let k=0;k<4;k++){
    const a=k*Math.PI/2, ca=Math.cos(a), sa=Math.sin(a);
    side.forEach(([u,v])=>{ const x=u, y=-h+v; pts.push([x*ca-y*sa, x*sa+y*ca]); });
  }
  return pts;
}
/* 側欄卡片用的斷面 SVG 圖示 */
function profileSVG(series,size,color){
  size=size||30; color=color||'#cbd5e1';
  const p=PROFILES[series], k=(size-2)/p.s, c=size/2;
  const d=profilePts(p.s,p.slot).map((q,i)=>(i?'L':'M')+(c+q[0]*k).toFixed(1)+' '+(c-q[1]*k).toFixed(1)).join('')+'Z';
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><path d="${d}" fill="${color}" stroke="#0b1220" stroke-width=".6"/><circle cx="${c}" cy="${c}" r="${(p.s*0.11*k).toFixed(1)}" fill="#0a1222"/></svg>`;
}
