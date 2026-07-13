import React, { useState, useEffect } from "react";
import {
  LayoutDashboard, Database, FileDown, RefreshCw, Plus, Settings2,
  Eye, Pencil, Trash2, Copy, GripVertical, X, ChevronLeft, Check,
  BarChart3, LineChart as LineIcon, PieChart as PieIcon,
  Activity, Gauge, ScatterChart as ScatterIcon, Hash,
  CircleDot, ArrowRight, Sparkles, Clock, ShieldCheck, FileText, Menu, MoreVertical
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  ScatterChart, Scatter, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";

/* ====================== Design System ====================== */
const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');

:root{
  --paper:#F2EEE4; --paper2:#FBFAF5; --card:#FCFBF7;
  --ink:#1C1A14; --ink2:#56524690; --ink-soft:#6E6A5C;
  --line:#E3DDCE; --line2:#D6CFBC;
  --teal:#0F5A50; --teal-d:#0A463E; --teal-soft:#DDEAE5;
  --amber:#BD6A1A; --amber-soft:#F2E2CB;
  --font-d:'Fraunces',Georgia,serif;
  --font-u:'Hanken Grotesk',system-ui,sans-serif;
  --font-m:'JetBrains Mono',monospace;
}
*{box-sizing:border-box}
.kan{font-family:var(--font-u);color:var(--ink);-webkit-font-smoothing:antialiased}
.kan h1,.kan h2,.kan h3,.kan .disp{font-family:var(--font-d);letter-spacing:-.01em}
.mono{font-family:var(--font-m);font-variant-numeric:tabular-nums}

.paperbg{
  background:
    radial-gradient(120% 120% at 100% 0%, #F7F3E9 0%, transparent 55%),
    radial-gradient(120% 120% at 0% 100%, #EFE9DB 0%, transparent 50%),
    var(--paper);
}
.grain:before{
  content:"";position:fixed;inset:0;pointer-events:none;z-index:1;opacity:.035;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
.brand{font-family:var(--font-d);font-weight:600;letter-spacing:-.02em}
.kanji{font-family:var(--font-d);font-weight:600}

.btn{font-family:var(--font-u);font-weight:600;border:none;cursor:pointer;
  display:inline-flex;align-items:center;gap:8px;border-radius:10px;
  transition:.16s ease;font-size:14px;white-space:nowrap}
.btn:active{transform:translateY(1px)}
.btn-primary{background:var(--teal);color:#F5F2E8;padding:10px 18px}
.btn-primary:hover{background:var(--teal-d)}
.btn-ghost{background:transparent;color:var(--ink);padding:8px 14px;border:1px solid var(--line2)}
.btn-ghost:hover{background:#0000000a}
.btn-amber{background:var(--amber);color:#FCF7EE;padding:10px 18px}
.btn-amber:hover{filter:brightness(.94)}
.btn-icon{padding:8px;border-radius:9px;background:transparent;border:1px solid transparent;color:var(--ink-soft);cursor:pointer}
.btn-icon:hover{background:#0000000a;color:var(--ink)}

.card{background:var(--card);border:1px solid var(--line);border-radius:14px}
.chip{font-family:var(--font-m);font-size:11px;font-weight:500;padding:3px 9px;
  border-radius:999px;letter-spacing:.02em;display:inline-flex;align-items:center;gap:5px}
.chip-teal{background:var(--teal-soft);color:var(--teal-d)}
.chip-amber{background:var(--amber-soft);color:#8A4A11}

.navlink{display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:10px;
  font-weight:600;font-size:14px;color:var(--ink-soft);cursor:pointer;transition:.15s}
.navlink:hover{background:#00000008;color:var(--ink)}
.navlink.active{background:var(--ink);color:var(--paper2)}

.fadein{animation:fade .5s ease both}
@keyframes fade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes slideup{from{transform:translateY(100%)}to{transform:translateY(0)}}
.stagger>*{animation:fade .5s ease both}
.stagger>*:nth-child(1){animation-delay:.02s}.stagger>*:nth-child(2){animation-delay:.06s}
.stagger>*:nth-child(3){animation-delay:.10s}.stagger>*:nth-child(4){animation-delay:.14s}
.stagger>*:nth-child(5){animation-delay:.18s}.stagger>*:nth-child(6){animation-delay:.22s}

.dashbox{outline:1px dashed var(--line2);outline-offset:-1px}
.gridcell{background:var(--card);border:1px solid var(--line);border-radius:12px;position:relative;overflow:hidden;transition:.16s}
.gridcell.sel{border-color:var(--teal);box-shadow:0 0 0 3px var(--teal-soft)}
.gridcell.edit:hover{border-color:var(--line2)}
.drag-h{cursor:grab;color:var(--ink2)}
.widget-x{position:absolute;top:8px;right:8px;z-index:3}
.resize{position:absolute;right:3px;bottom:3px;width:14px;height:14px;
  border-right:2px solid var(--line2);border-bottom:2px solid var(--line2);
  border-bottom-right-radius:4px;opacity:.7;cursor:nwse-resize}

.field-label{font-size:12px;font-weight:600;color:var(--ink-soft);
  text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;display:block}
.input{width:100%;font-family:var(--font-u);font-size:14px;color:var(--ink);
  background:var(--paper2);border:1px solid var(--line2);border-radius:9px;padding:9px 11px}
.input:focus{outline:none;border-color:var(--teal)}
.seg{display:flex;background:var(--paper);border:1px solid var(--line2);border-radius:10px;padding:3px}
.seg button{flex:1;border:none;background:transparent;padding:7px 10px;border-radius:7px;
  font-family:var(--font-u);font-weight:600;font-size:13px;color:var(--ink-soft);cursor:pointer}
.seg button.on{background:var(--card);color:var(--ink);box-shadow:0 1px 2px #0000001a}

.tbl{width:100%;border-collapse:collapse;font-size:13px}
.tbl th{font-family:var(--font-m);font-size:11px;text-transform:uppercase;letter-spacing:.04em;
  color:var(--ink-soft);text-align:left;padding:9px 12px;border-bottom:1px solid var(--line2);font-weight:600}
.tbl td{padding:9px 12px;border-bottom:1px solid var(--line);font-family:var(--font-m);font-size:12.5px;white-space:nowrap}
.tbl tr:last-child td{border-bottom:none}

.scroll::-webkit-scrollbar{width:9px;height:9px}
.scroll::-webkit-scrollbar-thumb{background:var(--line2);border-radius:9px}
.scroll::-webkit-scrollbar-track{background:transparent}
.hscroll{display:flex;gap:8px;overflow-x:auto;-webkit-overflow-scrolling:touch}
.hscroll::-webkit-scrollbar{display:none}

.sheet-bg{position:fixed;inset:0;background:#1c1a1455;backdrop-filter:blur(2px);z-index:50;animation:fade .2s ease;display:flex;align-items:flex-end}
.sheet{background:var(--paper2);width:100%;border-radius:18px 18px 0 0;max-height:78vh;overflow-y:auto;
  animation:slideup .26s cubic-bezier(.2,.8,.2,1);box-shadow:0 -10px 40px -10px #1c1a1455}
.sheet-grip{width:38px;height:4px;border-radius:99px;background:var(--line2);margin:10px auto 4px}

.mnav{position:fixed;bottom:0;left:0;right:0;z-index:30;background:var(--paper2);
  border-top:1px solid var(--line);display:flex;padding:6px 8px calc(6px + env(safe-area-inset-bottom))}
.mnav button{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;background:none;border:none;
  padding:7px 0;color:var(--ink-soft);font-family:var(--font-u);font-weight:600;font-size:11px;cursor:pointer}
.mnav button.on{color:var(--teal)}
`;

/* ====================== Viewport hook ====================== */
function useViewport() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => {
    const f = () => setW(window.innerWidth);
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  return { w, isMobile: w < 860, isNarrow: w < 520 };
}

/* ====================== Mock Data ====================== */
const HEX = ["#0F5A50","#BD6A1A","#2F6F8F","#A8472B","#6E8B4E","#B79321","#7A4A6E"];
const salesByMonth = [
  { x:"1月",売上:420,目標:400 },{ x:"2月",売上:390,目標:410 },{ x:"3月",売上:530,目標:430 },
  { x:"4月",売上:480,目標:460 },{ x:"5月",売上:610,目標:500 },{ x:"6月",売上:680,目標:540 },
];
const channelData = [{ name:"直販",value:38 },{ name:"代理店",value:27 },{ name:"EC",value:21 },{ name:"その他",value:14 }];
const regionData = [{ name:"関東",売上:540 },{ name:"関西",売上:410 },{ name:"中部",売上:300 },{ name:"九州",売上:230 },{ name:"東北",売上:180 }];
const scatterData = Array.from({length:24},()=>({ x:20+Math.round(Math.random()*60), y:30+Math.round(Math.random()*55) }));
const radarData = [{ k:"価格",v:80 },{ k:"品質",v:95 },{ k:"納期",v:70 },{ k:"対応",v:88 },{ k:"認知",v:60 }];

/* ユーザーアンケート（ダミー）。合計はいずれも n=1,247 件に整合 */
const SURVEY = {
  satisfaction: [
    { name:"とても不満",value:74 },{ name:"不満",value:137 },{ name:"普通",value:299 },
    { name:"満足",value:474 },{ name:"とても満足",value:263 },
  ],
  source: [
    { name:"検索",value:424 },{ name:"SNS",value:337 },{ name:"紹介",value:236 },
    { name:"広告",value:150 },{ name:"その他",value:100 },
  ],
  features: [
    { k:"使いやすさ",v:82 },{ k:"表示速度",v:74 },{ k:"デザイン",v:88 },
    { k:"機能の豊富さ",v:69 },{ k:"サポート",v:77 },{ k:"価格",v:63 },
  ],
  trend: [
    { x:"1月",回答数:120 },{ x:"2月",回答数:145 },{ x:"3月",回答数:188 },
    { x:"4月",回答数:402 },{ x:"5月",回答数:230 },{ x:"6月",回答数:162 },
  ],
  age: [
    { name:"~19",回答:50 },{ name:"20代",回答:312 },{ name:"30代",回答:401 },
    { name:"40代",回答:286 },{ name:"50代~",回答:198 },
  ],
};
const SURVEY_COLS = [
  { name:"submitted_at", type:"date" },{ name:"age_group", type:"string" },
  { name:"satisfaction", type:"number" },{ name:"nps", type:"number" },
  { name:"channel", type:"string" },{ name:"comment", type:"string" },
];
const SURVEY_ROWS = [
  ["2026-04-02","30代","5","9","検索","UIが直感的で助かっている"],
  ["2026-04-02","20代","4","8","SNS","表示が速くてストレスがない"],
  ["2026-04-03","40代","3","6","紹介","機能は十分だが価格がやや高い"],
  ["2026-04-05","50代~","5","10","紹介","サポートの対応が丁寧だった"],
  ["2026-04-06","20代","2","4","広告","スマホだと操作しづらい場面がある"],
];

const PREVIEW_ROWS = [
  ["2026-01-05","関東","直販","ノートPC","420000"],["2026-01-08","関西","EC","モニター","118000"],
  ["2026-02-02","中部","代理店","ノートPC","390000"],["2026-03-11","関東","直販","周辺機器","53000"],
  ["2026-04-19","九州","EC","モニター","96000"],
];
const PREVIEW_COLS = [
  { name:"date", type:"date" },{ name:"region", type:"string" },{ name:"channel", type:"string" },
  { name:"product", type:"string" },{ name:"amount", type:"number" },
];
const initialDataSources = [
  { id:"ds1", name:"2026 売上明細", spreadsheetId:"1aZ…q9", range:"Sheet1!A1:F500", authMode:"OAUTH", refresh:300, used:4 },
  { id:"ds2", name:"マーケ KPI 週次", spreadsheetId:"1bV…k2", range:"weekly!A:H", authMode:"OAUTH", refresh:600, used:2 },
  { id:"ds3", name:"公開為替レート", spreadsheetId:"1cP…m8", range:"rates!A1:C90", authMode:"PUBLIC", refresh:1800, used:1 },
  { id:"ds4", name:"ユーザーアンケート 2026Q2", spreadsheetId:"1dQ…r4", range:"responses!A1:G1300", authMode:"OAUTH", refresh:3600, used:3 },
];
const initialDashboards = [
  { id:"d1", title:"全社セールス概況", desc:"売上・チャネル・地域の主要指標を一望", updated:"2026-06-05", widgets:7 },
  { id:"d2", title:"マーケティング週次", desc:"獲得チャネル別の推移と効率", updated:"2026-06-03", widgets:5 },
  { id:"d3", title:"地域別パフォーマンス", desc:"エリア横断の比較ダッシュボード", updated:"2026-05-28", widgets:6 },
  { id:"d4", title:"ユーザーアンケート結果", desc:"満足度・NPS・項目別評価を集計（n=1,247）", updated:"2026-06-06", widgets:9 },
];
const initialWidgets = [
  { id:"w1", kind:"kpi",  title:"今月の売上",   ds:"ds1", w:3, h:1, metric:"¥6.8M", delta:"+11.5%" },
  { id:"w2", kind:"kpi",  title:"目標達成率",   ds:"ds1", w:3, h:1, metric:"126%", delta:"+8pt" },
  { id:"w3", kind:"kpi",  title:"平均単価",     ds:"ds1", w:3, h:1, metric:"¥48,200", delta:"-2.1%" },
  { id:"w4", kind:"kpi",  title:"新規顧客",     ds:"ds1", w:3, h:1, metric:"312", delta:"+24" },
  { id:"w5", kind:"line", title:"売上と目標の推移", ds:"ds1", w:8, h:2 },
  { id:"w6", kind:"pie",  title:"チャネル構成比", ds:"ds1", w:4, h:2 },
  { id:"w7", kind:"bar",  title:"地域別売上",   ds:"ds1", w:6, h:2 },
  { id:"w8", kind:"radar",title:"競合スコア",   ds:"ds2", w:6, h:2 },
];
const surveyWidgets = [
  { id:"s1", kind:"kpi", title:"総回答数",   ds:"ds4", w:3, h:1, metric:"1,247", delta:"+312" },
  { id:"s2", kind:"kpi", title:"平均満足度", ds:"ds4", w:3, h:1, metric:"4.1 / 5", delta:"+0.3" },
  { id:"s3", kind:"kpi", title:"NPS",       ds:"ds4", w:3, h:1, metric:"+42", delta:"+7pt" },
  { id:"s4", kind:"kpi", title:"回答完了率", ds:"ds4", w:3, h:1, metric:"78%", delta:"-2pt" },
  { id:"s5", kind:"bar",  title:"満足度の分布", ds:"ds4", w:6, h:2, chart:{ data:SURVEY.satisfaction, xKey:"name", barKey:"value" } },
  { id:"s6", kind:"pie",  title:"認知経路",     ds:"ds4", w:6, h:2, chart:{ data:SURVEY.source } },
  { id:"s7", kind:"radar",title:"項目別評価（5段階換算）", ds:"ds4", w:6, h:2, chart:{ data:SURVEY.features, angleKey:"k", valueKey:"v" } },
  { id:"s8", kind:"line", title:"月次回答数の推移", ds:"ds4", w:6, h:2, chart:{ data:SURVEY.trend, xKey:"x", lines:[{ key:"回答数", color:HEX[0] }] } },
  { id:"s9", kind:"bar",  title:"年代別の回答数", ds:"ds4", w:12, h:2, chart:{ data:SURVEY.age, xKey:"name", barKey:"回答" } },
];
const WIDGET_SETS = { d4: surveyWidgets };

const PREVIEWS = {
  ds1: { cols: PREVIEW_COLS, rows: PREVIEW_ROWS },
  ds4: { cols: SURVEY_COLS, rows: SURVEY_ROWS },
};

const PRINT_SETS = {
  d4: {
    kpis: [["総回答数","1,247"],["平均満足度","4.1 / 5"],["NPS","+42"],["完了率","78%"]],
    line: { title:"月次回答数の推移", cfg:{ data:SURVEY.trend, xKey:"x", lines:[{ key:"回答数", color:HEX[0] }] } },
    pie:  { title:"認知経路", cfg:{ data:SURVEY.source } },
    bar:  { title:"満足度の分布", cfg:{ data:SURVEY.satisfaction, xKey:"name", barKey:"value" } },
  },
  default: {
    kpis: [["今月の売上","¥6.8M"],["達成率","126%"],["平均単価","¥48,200"],["新規顧客","312"]],
    line: { title:"売上と目標の推移", cfg:undefined },
    pie:  { title:"チャネル構成比", cfg:undefined },
    bar:  { title:"地域別売上", cfg:undefined },
  },
};
const CHART_TYPES = [
  { kind:"kpi",label:"KPIカード",icon:Hash },{ kind:"line",label:"折れ線",icon:LineIcon },
  { kind:"bar",label:"棒",icon:BarChart3 },{ kind:"area",label:"面",icon:Activity },
  { kind:"pie",label:"円・ドーナツ",icon:PieIcon },{ kind:"scatter",label:"散布図",icon:ScatterIcon },
  { kind:"radar",label:"レーダー",icon:CircleDot },{ kind:"gauge",label:"ゲージ",icon:Gauge },
];

/* ====================== Charts ====================== */
function ChartBody({ kind, cfg = {} }) {
  const ax = { fontSize:11, fontFamily:"var(--font-m)", fill:"#6E6A5C" };
  const tip = { fontFamily:"var(--font-m)", fontSize:12, borderRadius:8, border:"1px solid #D6CFBC" };
  if (kind === "line") {
    const data = cfg.data || salesByMonth;
    const xKey = cfg.xKey || "x";
    const lines = cfg.lines || [{ key:"売上", color:HEX[0] },{ key:"目標", color:HEX[1], dashed:true }];
    return (
      <ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{top:8,right:10,left:-18,bottom:0}}>
        <CartesianGrid stroke="#E3DDCE" vertical={false}/><XAxis dataKey={xKey} tick={ax} axisLine={false} tickLine={false}/>
        <YAxis tick={ax} axisLine={false} tickLine={false}/><Tooltip contentStyle={tip}/>
        {lines.map((l,i)=>(
          <Line key={i} type="monotone" dataKey={l.key} stroke={l.color} strokeWidth={l.dashed?2:2.5}
            strokeDasharray={l.dashed?"5 4":undefined} dot={l.dashed?false:{r:3}}/>
        ))}
      </LineChart></ResponsiveContainer> );
  }
  if (kind === "bar") {
    const data = cfg.data || regionData;
    const xKey = cfg.xKey || "name";
    const barKey = cfg.barKey || "売上";
    return (
      <ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{top:8,right:10,left:-18,bottom:0}}>
        <CartesianGrid stroke="#E3DDCE" vertical={false}/><XAxis dataKey={xKey} tick={ax} axisLine={false} tickLine={false}/>
        <YAxis tick={ax} axisLine={false} tickLine={false}/><Tooltip contentStyle={tip}/>
        <Bar dataKey={barKey} radius={[6,6,0,0]}>{data.map((_,i)=><Cell key={i} fill={HEX[i%HEX.length]}/>)}</Bar>
      </BarChart></ResponsiveContainer> );
  }
  if (kind === "area") {
    const data = cfg.data || salesByMonth;
    const xKey = cfg.xKey || "x";
    const areaKey = cfg.areaKey || "売上";
    return (
      <ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{top:8,right:10,left:-18,bottom:0}}>
        <defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={HEX[0]} stopOpacity={.35}/><stop offset="100%" stopColor={HEX[0]} stopOpacity={0}/></linearGradient></defs>
        <CartesianGrid stroke="#E3DDCE" vertical={false}/><XAxis dataKey={xKey} tick={ax} axisLine={false} tickLine={false}/>
        <YAxis tick={ax} axisLine={false} tickLine={false}/><Tooltip contentStyle={tip}/>
        <Area type="monotone" dataKey={areaKey} stroke={HEX[0]} strokeWidth={2.5} fill="url(#ga)"/>
      </AreaChart></ResponsiveContainer> );
  }
  if (kind === "pie") {
    const data = cfg.data || channelData;
    return (
      <ResponsiveContainer width="100%" height="100%"><PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="52%" outerRadius="82%" paddingAngle={2}>
          {data.map((_,i)=><Cell key={i} fill={HEX[i%HEX.length]}/>)}</Pie><Tooltip contentStyle={tip}/>
      </PieChart></ResponsiveContainer> );
  }
  if (kind === "scatter") {
    const data = cfg.data || scatterData;
    return (
      <ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{top:8,right:10,left:-18,bottom:0}}>
        <CartesianGrid stroke="#E3DDCE"/><XAxis type="number" dataKey="x" tick={ax} axisLine={false} tickLine={false}/>
        <YAxis type="number" dataKey="y" tick={ax} axisLine={false} tickLine={false}/><Tooltip contentStyle={tip}/>
        <Scatter data={data} fill={HEX[2]}/></ScatterChart></ResponsiveContainer> );
  }
  if (kind === "radar") {
    const data = cfg.data || radarData;
    const angleKey = cfg.angleKey || "k";
    const valueKey = cfg.valueKey || "v";
    return (
      <ResponsiveContainer width="100%" height="100%"><RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke="#E3DDCE"/><PolarAngleAxis dataKey={angleKey} tick={{fontSize:11,fontFamily:"var(--font-m)",fill:"#6E6A5C"}}/>
        <PolarRadiusAxis tick={false} axisLine={false}/><Radar dataKey={valueKey} stroke={HEX[0]} fill={HEX[0]} fillOpacity={.3}/>
      </RadarChart></ResponsiveContainer> );
  }
  if (kind === "gauge") {
    const val = cfg.value ?? 0.72;
    const label = cfg.label || Math.round(val*100)+"%";
    return (
      <div className="flex items-center justify-center h-full">
        <div style={{position:"relative",width:160,height:90,overflow:"hidden"}}>
          <div style={{width:160,height:160,borderRadius:"50%",
            background:`conic-gradient(from 270deg, ${HEX[0]} ${val*180}deg, #E3DDCE ${val*180}deg 180deg, transparent 180deg)`}}/>
          <div style={{position:"absolute",left:28,top:28,width:104,height:104,borderRadius:"50%",background:"var(--card)"}}/>
          <div className="mono" style={{position:"absolute",left:0,top:48,width:160,textAlign:"center",fontSize:26,fontWeight:600}}>{label}</div>
        </div>
      </div> );
  }
  return null;
}
function WidgetCard({ kind, metric, delta, cfg }) {
  if (kind === "kpi") {
    const up = delta && !delta.startsWith("-");
    return (
      <div className="flex flex-col justify-between h-full" style={{padding:"4px 2px"}}>
        <div className="mono" style={{fontSize:30,fontWeight:600,letterSpacing:"-.02em"}}>{metric}</div>
        <div className="flex items-center gap-2">
          <span className="chip" style={{background:up?"var(--teal-soft)":"#F4DAD2",color:up?"var(--teal-d)":"#A8472B"}}>{delta}</span>
          <span style={{fontSize:12,color:"var(--ink-soft)"}}>前月比</span>
        </div>
      </div> );
  }
  return <div style={{height:"100%"}}><ChartBody kind={kind} cfg={cfg}/></div>;
}

/* ====================== Sidebar (desktop) ====================== */
function Sidebar({ route, go, onLogout }) {
  return (
    <aside style={{width:230,flexShrink:0,borderRight:"1px solid var(--line)",background:"var(--paper2)"}} className="flex flex-col">
      <div style={{padding:"22px 20px 14px"}}>
        <BrandMark/>
      </div>
      <nav style={{padding:"6px 12px"}} className="flex flex-col gap-1">
        <div className={"navlink"+(route==="list"?" active":"")} onClick={()=>go("list")}><LayoutDashboard size={18}/> ダッシュボード</div>
        <div className={"navlink"+(route==="datasources"?" active":"")} onClick={()=>go("datasources")}><Database size={18}/> データソース</div>
      </nav>
      <div style={{marginTop:"auto",padding:16,borderTop:"1px solid var(--line)"}}>
        <div className="flex items-center gap-3" style={{marginBottom:12}}>
          <Avatar/><div style={{lineHeight:1.2}}><div style={{fontSize:13,fontWeight:600}}>佐藤 彩</div><div style={{fontSize:11,color:"var(--ink-soft)"}}>sato@example.com</div></div>
        </div>
        <button className="btn btn-ghost" style={{width:"100%",justifyContent:"center"}} onClick={onLogout}>ログアウト</button>
      </div>
    </aside>
  );
}
function BrandMark({ big }) {
  return (
    <div className="flex items-center gap-3">
      <div style={{width:big?52:40,height:big?52:40,borderRadius:big?14:11,background:"var(--ink)",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <span className="kanji" style={{color:"var(--paper)",fontSize:big?30:22,lineHeight:1}}>観</span>
      </div>
      <div>
        <div className="brand" style={{fontSize:big?32:20,lineHeight:1}}>Kan<span style={{color:"var(--amber)"}}>.</span></div>
        <div className="mono" style={{fontSize:big?11:10.5,color:"var(--ink-soft)",letterSpacing:".06em"}}>SHEETS BI</div>
      </div>
    </div>
  );
}
function Avatar(){ return <div style={{width:34,height:34,borderRadius:"50%",background:"var(--teal-soft)",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--teal-d)",fontWeight:700,fontSize:13}}>SA</div>; }

/* ====================== Login ====================== */
function Login({ onLogin, isNarrow }) {
  return (
    <div className="kan paperbg grain" style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:isNarrow?16:24,position:"relative"}}>
      <div className="fadein" style={{position:"relative",zIndex:2,width:"100%",maxWidth:420}}>
        <div className="flex items-center gap-3" style={{marginBottom:30,justifyContent:"center"}}><BrandMark big/></div>
        <div className="card" style={{padding:isNarrow?"26px 20px":"34px 30px",boxShadow:"0 18px 50px -28px #1c1a1455"}}>
          <h1 style={{fontSize:isNarrow?22:26,fontWeight:600,marginBottom:8}}>スプレッドシートを、<br/>洞察に。</h1>
          <p style={{color:"var(--ink-soft)",fontSize:14,lineHeight:1.6,marginBottom:26}}>Google スプレッドシートを読み込み、自由なレイアウトで可視化。PDF まで一気通貫。</p>
          <button className="btn" onClick={onLogin} style={{width:"100%",justifyContent:"center",background:"#fff",border:"1px solid var(--line2)",color:"var(--ink)",padding:"12px",fontSize:15}}>
            <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#4285F4" d="M45 24c0-1.6-.1-3.1-.4-4.5H24v9h11.8c-.5 2.7-2 5-4.3 6.6v5.5h7C42.6 36.9 45 31 45 24z"/><path fill="#34A853" d="M24 46c5.8 0 10.7-1.9 14.3-5.2l-7-5.5c-1.9 1.3-4.4 2.1-7.3 2.1-5.6 0-10.3-3.8-12-8.9H4.7v5.6C8.3 41.6 15.6 46 24 46z"/><path fill="#FBBC05" d="M12 28.5c-.5-1.5-.8-3-.8-4.5s.3-3 .8-4.5v-5.6H4.7C3.1 17.1 2 20.4 2 24s1.1 6.9 2.7 9.6L12 28.5z"/><path fill="#EA4335" d="M24 11.4c3.2 0 6 1.1 8.2 3.2l6.1-6.1C34.6 5 29.7 3 24 3 15.6 3 8.3 7.4 4.7 14.4l7.3 5.6c1.7-5.1 6.4-8.6 12-8.6z"/></svg>
            Google でログイン
          </button>
          <div className="flex items-center gap-2" style={{marginTop:18,color:"var(--ink-soft)",fontSize:12}}><ShieldCheck size={14}/> OAuth 増分認可・トークンはサーバー保管。閲覧専用です。</div>
        </div>
        <p className="mono" style={{textAlign:"center",marginTop:18,fontSize:11,color:"var(--ink2)"}}>所有者スコープ / v1</p>
      </div>
    </div>
  );
}

/* ====================== Dashboard List ====================== */
function DashboardList({ dashboards, openDash, removeDash, isMobile }) {
  return (
    <div className="fadein" style={{padding:isMobile?"22px 16px":"34px 40px",maxWidth:1100}}>
      <div className="flex items-end justify-between" style={{marginBottom:22,gap:12}}>
        <div>
          <h1 style={{fontSize:isMobile?24:30,fontWeight:600}}>ダッシュボード</h1>
          <p style={{color:"var(--ink-soft)",marginTop:4,fontSize:isMobile?13:14}}>{dashboards.length} 件 · 最終更新 2026-06-05</p>
        </div>
        <button className="btn btn-primary" onClick={()=>openDash(dashboards[0])}><Plus size={17}/>{!isMobile&&" 新規作成"}</button>
      </div>
      <div className="stagger" style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(auto-fill,minmax(300px,1fr))",gap:isMobile?14:18}}>
        {dashboards.map(d=>(
          <div key={d.id} className="card" style={{overflow:"hidden",display:"flex",flexDirection:"column"}}>
            <div onClick={()=>openDash(d)} style={{cursor:"pointer",height:128,background:"var(--paper)",borderBottom:"1px solid var(--line)",padding:14,position:"relative"}}>
              <div style={{position:"absolute",inset:14,opacity:.9}}>
                <ResponsiveContainer width="100%" height="100%"><AreaChart data={salesByMonth} margin={{top:6,right:0,left:0,bottom:0}}>
                  <defs><linearGradient id={"g"+d.id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={HEX[0]} stopOpacity={.3}/><stop offset="100%" stopColor={HEX[0]} stopOpacity={0}/></linearGradient></defs>
                  <Area type="monotone" dataKey="売上" stroke={HEX[0]} strokeWidth={2} fill={"url(#g"+d.id+")"}/>
                </AreaChart></ResponsiveContainer>
              </div>
            </div>
            <div style={{padding:"15px 16px",flex:1,display:"flex",flexDirection:"column"}}>
              <h3 style={{fontSize:18,fontWeight:600,marginBottom:4}}>{d.title}</h3>
              <p style={{fontSize:13,color:"var(--ink-soft)",lineHeight:1.5,flex:1}}>{d.desc}</p>
              <div className="flex items-center justify-between" style={{marginTop:14}}>
                <div className="flex items-center gap-3" style={{fontSize:11.5,color:"var(--ink2)"}}>
                  <span className="flex items-center gap-1"><Clock size={12}/>{d.updated}</span>
                  <span className="flex items-center gap-1"><LayoutDashboard size={12}/>{d.widgets}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button className="btn-icon" title="複製"><Copy size={15}/></button>
                  <button className="btn-icon" title="削除" onClick={()=>removeDash(d.id)}><Trash2 size={15}/></button>
                  <button className="btn-icon" title="開く" onClick={()=>openDash(d)}><ArrowRight size={16}/></button>
                </div>
              </div>
            </div>
          </div>
        ))}
        <div onClick={()=>openDash(dashboards[0])} className="dashbox" style={{borderRadius:14,minHeight:isMobile?120:260,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10,cursor:"pointer",color:"var(--ink-soft)"}}>
          <div style={{width:46,height:46,borderRadius:12,background:"var(--card)",border:"1px solid var(--line2)",display:"flex",alignItems:"center",justifyContent:"center"}}><Plus size={22}/></div>
          <span style={{fontWeight:600,fontSize:14}}>空のダッシュボードを作成</span>
        </div>
      </div>
    </div>
  );
}

/* ====================== Data Sources ====================== */
function DataSources({ sources, isMobile }) {
  const [sel, setSel] = useState(sources[0].id);
  const cur = sources.find(s=>s.id===sel);
  const prev = PREVIEWS[sel] || { cols: PREVIEW_COLS, rows: PREVIEW_ROWS };
  const [types, setTypes] = useState(prev.cols.map(c=>c.type));
  useEffect(() => { setTypes((PREVIEWS[sel] || { cols: PREVIEW_COLS }).cols.map(c=>c.type)); }, [sel]);
  return (
    <div className="fadein" style={{padding:isMobile?"22px 16px":"34px 40px",maxWidth:1180}}>
      <div className="flex items-end justify-between" style={{marginBottom:22,gap:12}}>
        <div>
          <h1 style={{fontSize:isMobile?24:30,fontWeight:600}}>データソース</h1>
          <p style={{color:"var(--ink-soft)",marginTop:4,fontSize:isMobile?13:14}}>トップレベル資産 · 複数ダッシュボードから再利用</p>
        </div>
        <button className="btn btn-primary"><Plus size={17}/>{!isMobile&&" シートを接続"}</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"320px 1fr",gap:isMobile?14:20}}>
        <div className={isMobile?"hscroll":"flex flex-col gap-2"} style={isMobile?{paddingBottom:4}:{}}>
          {sources.map(s=>(
            <div key={s.id} onClick={()=>setSel(s.id)} className="card"
              style={{padding:14,cursor:"pointer",flexShrink:0,minWidth:isMobile?230:undefined,
                borderColor: sel===s.id?"var(--teal)":"var(--line)", boxShadow: sel===s.id?"0 0 0 3px var(--teal-soft)":"none"}}>
              <div className="flex items-center justify-between" style={{marginBottom:8}}>
                <span style={{fontWeight:600,fontSize:15}}>{s.name}</span>
                <span className={"chip "+(s.authMode==="OAUTH"?"chip-teal":"chip-amber")}>{s.authMode==="OAUTH"?"OAuth":"公開"}</span>
              </div>
              <div className="mono" style={{fontSize:11.5,color:"var(--ink-soft)"}}>{s.range}</div>
              <div className="flex items-center gap-3" style={{marginTop:10,fontSize:11.5,color:"var(--ink2)"}}>
                <span className="flex items-center gap-1"><RefreshCw size={12}/>{s.refresh}s</span>
                <span className="flex items-center gap-1"><LayoutDashboard size={12}/>{s.used} 箇所</span>
              </div>
            </div>
          ))}
        </div>
        <div className="card" style={{padding:0,overflow:"hidden"}}>
          <div style={{padding:"16px 18px",borderBottom:"1px solid var(--line)"}} className="flex items-center justify-between gap-2">
            <div style={{minWidth:0}}>
              <h3 style={{fontSize:18,fontWeight:600}}>{cur.name}</h3>
              <div className="mono" style={{fontSize:11.5,color:"var(--ink-soft)",marginTop:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>id: {cur.spreadsheetId} · {cur.range}</div>
            </div>
            <button className="btn btn-ghost" style={{flexShrink:0}}><RefreshCw size={15}/>{!isMobile&&" 再取得"}</button>
          </div>
          <div style={{padding:"14px 18px",borderBottom:"1px solid var(--line)"}} className="flex items-center gap-2">
            <Sparkles size={15} style={{color:"var(--amber)",flexShrink:0}}/>
            <span style={{fontSize:12.5,color:"var(--ink-soft)"}}>先頭 5 行のプレビュー。列の型は推論値 ── 上書き可能です。</span>
          </div>
          <div className="scroll" style={{padding:"6px 8px 0",overflowX:"auto"}}>
            <table className="tbl">
              <thead><tr>{prev.cols.map((c,i)=>(
                <th key={c.name}><div style={{display:"flex",flexDirection:"column",gap:6}}>
                  <span style={{color:"var(--ink)",textTransform:"none",fontSize:12.5}}>{c.name}</span>
                  <select className="input" style={{padding:"4px 6px",fontSize:11,fontFamily:"var(--font-m)"}} value={types[i]} onChange={e=>{const t=[...types];t[i]=e.target.value;setTypes(t);}}>
                    <option value="string">string</option><option value="number">number</option><option value="date">date</option>
                  </select>
                </div></th>
              ))}</tr></thead>
              <tbody>{prev.rows.map((r,i)=>(<tr key={i}>{r.map((cell,j)=><td key={j} style={{color:types[j]==="number"?"var(--teal-d)":"var(--ink)"}}>{cell}</td>)}</tr>))}</tbody>
            </table>
          </div>
          <div style={{padding:"14px 18px"}} className="flex items-center justify-between gap-2">
            <span className="mono" style={{fontSize:11,color:"var(--ink2)"}}>Redis キャッシュ済 · TTL {cur.refresh}s</span>
            <button className="btn btn-primary" style={{padding:"8px 16px"}}><Check size={15}/> 型を保存</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ====================== Editor panels (shared) ====================== */
function AddPanel({ sources, addWidget }) {
  return (
    <>
      <div className="field-label">チャートを追加</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:24}}>
        {CHART_TYPES.map(c=>(
          <button key={c.kind} onClick={()=>addWidget(c.kind)}
            style={{display:"flex",flexDirection:"column",alignItems:"center",gap:7,padding:"13px 6px",background:"var(--card)",border:"1px solid var(--line2)",borderRadius:10,cursor:"pointer",color:"var(--ink)"}}>
            <c.icon size={19} style={{color:"var(--teal)"}}/><span style={{fontSize:11.5,fontWeight:600}}>{c.label}</span>
          </button>
        ))}
      </div>
      <div className="field-label">データソース</div>
      <div className="flex flex-col gap-2">
        {sources.map(s=>(
          <div key={s.id} className="flex items-center gap-2" style={{padding:"9px 11px",background:"var(--card)",border:"1px solid var(--line)",borderRadius:9}}>
            <Database size={15} style={{color:"var(--ink-soft)"}}/>
            <span style={{fontSize:13,fontWeight:600,flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.name}</span>
            <GripVertical size={14} className="drag-h"/>
          </div>
        ))}
      </div>
    </>
  );
}
function ConfigPanel({ sel, sources, patchSel }) {
  if (!sel) return (
    <div style={{textAlign:"center",color:"var(--ink-soft)",paddingTop:60}}>
      <Settings2 size={26} style={{margin:"0 auto 10px",opacity:.5}}/>
      <p style={{fontSize:13}}>ウィジェットを選択すると<br/>ここに設定が表示されます。</p>
    </div>
  );
  return (
    <>
      <div className="flex items-center gap-2" style={{marginBottom:16}}><Settings2 size={16} style={{color:"var(--teal)"}}/><span style={{fontWeight:600,fontSize:15}}>ウィジェット設定</span></div>
      <label className="field-label">タイトル</label>
      <input className="input" value={sel.title} onChange={e=>patchSel("title",e.target.value)} style={{marginBottom:18}}/>
      <label className="field-label">データソース</label>
      <select className="input" value={sel.ds} onChange={e=>patchSel("ds",e.target.value)} style={{marginBottom:18}}>{sources.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <label className="field-label">チャート種別</label>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:18}}>
        {CHART_TYPES.map(c=>(
          <button key={c.kind} onClick={()=>patchSel("kind",c.kind)}
            style={{display:"flex",alignItems:"center",gap:6,padding:"8px 9px",borderRadius:8,border:"1px solid "+(sel.kind===c.kind?"var(--teal)":"var(--line2)"),background:sel.kind===c.kind?"var(--teal-soft)":"var(--card)",cursor:"pointer",color:sel.kind===c.kind?"var(--teal-d)":"var(--ink)",fontSize:11.5,fontWeight:600}}>
            <c.icon size={14}/>{c.label}
          </button>
        ))}
      </div>
      <div style={{height:1,background:"var(--line)",margin:"4px 0 18px"}}/>
      <div className="field-label">クエリ（サーバー集計）</div>
      <div className="flex flex-col gap-3" style={{marginBottom:18}}>
        <div><span style={{fontSize:12,color:"var(--ink-soft)"}}>ディメンション</span>
          <select className="input" style={{marginTop:5}}><option>region（地域）</option><option>channel</option><option>month</option></select></div>
        <div><span style={{fontSize:12,color:"var(--ink-soft)"}}>メジャー</span>
          <div className="flex gap-2" style={{marginTop:5}}><select className="input" style={{flex:1}}><option>amount</option></select>
            <select className="input" style={{width:96}}><option>sum</option><option>avg</option><option>count</option></select></div></div>
      </div>
      <div className="field-label">配色テーマ</div>
      <div className="flex gap-2">{HEX.map((c,i)=><div key={i} style={{width:26,height:26,borderRadius:7,background:c,border:i===0?"2px solid var(--ink)":"1px solid var(--line2)"}}/>)}</div>
    </>
  );
}

/* ====================== Editor ====================== */
function Editor({ dash, sources, goBack, openPrint, isMobile }) {
  const [mode, setMode] = useState("edit");
  const [widgets, setWidgets] = useState(WIDGET_SETS[dash.id] || initialWidgets);
  const [selId, setSelId] = useState(isMobile ? null : "w5");
  const [sheet, setSheet] = useState(null); // mobile: 'add' | 'config'
  const edit = mode === "edit";
  const sel = widgets.find(w=>w.id===selId);

  const addWidget = (kind) => {
    const id = "w"+Date.now();
    const isKpi = kind==="kpi";
    setWidgets([...widgets, { id, kind, title:"新しいウィジェット", ds:sources[0].id, w:isKpi?3:6, h:isKpi?1:2, metric:"—", delta:"+0%" }]);
    setSelId(id);
    setSheet(isMobile ? "config" : null);
  };
  const removeWidget = (id) => { setWidgets(widgets.filter(w=>w.id!==id)); if (selId===id){ setSelId(null); setSheet(null);} };
  const patchSel = (k,v) => setWidgets(widgets.map(w=>w.id===selId?{...w,[k]:v}:w));
  const pickWidget = (id) => { setSelId(id); if (isMobile && edit) setSheet("config"); };

  const cols = isMobile ? 1 : 12;

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh"}}>
      {/* Toolbar */}
      <div style={{borderBottom:"1px solid var(--line)",background:"var(--paper2)",padding:isMobile?"10px 12px":"12px 20px",flexShrink:0}} className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2" style={{minWidth:0}}>
          <button className="btn-icon" onClick={goBack}><ChevronLeft size={20}/></button>
          <div style={{minWidth:0}}>
            <input defaultValue={dash.title} className="brand"
              style={{fontSize:isMobile?17:21,fontWeight:600,border:"none",background:"transparent",outline:"none",color:"var(--ink)",width:isMobile?150:280}}/>
            {!isMobile && <div className="mono" style={{fontSize:11,color:"var(--ink2)"}}>自動保存済 · {widgets.length} ウィジェット</div>}
          </div>
        </div>
        <div className="flex items-center gap-2" style={{flexShrink:0}}>
          <div className="seg" style={{width:isMobile?92:170}}>
            <button className={edit?"on":""} onClick={()=>setMode("edit")}><span className="flex items-center justify-center gap-1"><Pencil size={13}/>{!isMobile&&"編集"}</span></button>
            <button className={!edit?"on":""} onClick={()=>{setMode("view");setSheet(null);}}><span className="flex items-center justify-center gap-1"><Eye size={13}/>{!isMobile&&"閲覧"}</span></button>
          </div>
          {!isMobile && <button className="btn btn-ghost"><RefreshCw size={15}/> 更新</button>}
          <button className="btn btn-amber" onClick={openPrint} style={isMobile?{padding:"9px 11px"}:{}}><FileDown size={16}/>{!isMobile&&" PDF 出力"}</button>
        </div>
      </div>

      {/* Mobile action strip */}
      {isMobile && edit && (
        <div className="hscroll" style={{padding:"8px 12px",borderBottom:"1px solid var(--line)",background:"var(--paper2)",flexShrink:0}}>
          <button className="btn btn-primary" style={{padding:"8px 14px"}} onClick={()=>setSheet("add")}><Plus size={15}/> チャート追加</button>
          <button className="btn btn-ghost" style={{padding:"8px 14px"}}><RefreshCw size={14}/> 更新</button>
          {sel && <button className="btn btn-ghost" style={{padding:"8px 14px"}} onClick={()=>setSheet("config")}><Settings2 size={14}/> 設定</button>}
        </div>
      )}

      <div style={{flex:1,display:"flex",minHeight:0}}>
        {/* Left panel (desktop only) */}
        {!isMobile && edit && (
          <div className="scroll" style={{width:230,flexShrink:0,borderRight:"1px solid var(--line)",background:"var(--paper2)",overflowY:"auto",padding:16}}>
            <AddPanel sources={sources} addWidget={addWidget}/>
          </div>
        )}

        {/* Canvas */}
        <div className="scroll paperbg" style={{flex:1,overflowY:"auto",padding:isMobile?14:24,position:"relative"}}>
          {edit && !isMobile && <div style={{position:"absolute",inset:0,opacity:.5,pointerEvents:"none",backgroundImage:"linear-gradient(#0000000a 1px,transparent 1px)",backgroundSize:"100% 28px"}}/>}
          <div style={{display:"grid",gridTemplateColumns:`repeat(${cols},1fr)`,gap:isMobile?12:14,position:"relative",maxWidth:1080,margin:"0 auto"}}>
            {widgets.map(w=>(
              <div key={w.id} className={"gridcell"+(edit?" edit":"")+(selId===w.id&&edit?" sel":"")} onClick={()=>edit&&pickWidget(w.id)}
                style={{gridColumn: isMobile?"auto":`span ${w.w}`, height:(isMobile?(w.kind==="kpi"?96:210):w.h*96), padding:14, cursor:edit?"pointer":"default"}}>
                <div className="flex items-center justify-between" style={{marginBottom:8}}>
                  <span style={{fontSize:13.5,fontWeight:600}}>{w.title}</span>
                  {edit && <GripVertical size={15} className="drag-h"/>}
                </div>
                <div style={{height:`calc(100% - 26px)`}}><WidgetCard kind={w.kind} metric={w.metric} delta={w.delta} cfg={w.chart}/></div>
                {edit && (<>
                  <button className="btn-icon widget-x" onClick={(e)=>{e.stopPropagation();removeWidget(w.id);}} style={{background:"var(--card)",border:"1px solid var(--line2)",padding:5}}><X size={13}/></button>
                  {!isMobile && <div className="resize"/>}
                </>)}
              </div>
            ))}
          </div>
        </div>

        {/* Right panel (desktop only) */}
        {!isMobile && edit && (
          <div className="scroll" style={{width:288,flexShrink:0,borderLeft:"1px solid var(--line)",background:"var(--paper2)",overflowY:"auto",padding:18}}>
            <ConfigPanel sel={sel} sources={sources} patchSel={patchSel}/>
          </div>
        )}
      </div>

      {/* Mobile bottom sheets */}
      {isMobile && sheet && (
        <div className="sheet-bg" onClick={()=>setSheet(null)}>
          <div className="sheet scroll" onClick={e=>e.stopPropagation()}>
            <div className="sheet-grip"/>
            <div className="flex items-center justify-between" style={{padding:"4px 18px 12px"}}>
              <span style={{fontWeight:600,fontSize:16}} className="brand">{sheet==="add"?"追加":"設定"}</span>
              <button className="btn-icon" onClick={()=>setSheet(null)}><X size={18}/></button>
            </div>
            <div style={{padding:"0 18px 28px"}}>
              {sheet==="add" ? <AddPanel sources={sources} addWidget={addWidget}/> : <ConfigPanel sel={sel} sources={sources} patchSel={patchSel}/>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ====================== Print / PDF Preview ====================== */
function PrintPreview({ dash, goBack, isMobile, w }) {
  const [size, setSize] = useState("A4");
  const [orient, setOrient] = useState("portrait");
  const land = orient==="landscape";
  const basePageW = land ? 720 : 540;
  const pageW = isMobile ? Math.min(basePageW, w - 32) : basePageW;
  const scaleKpi = isMobile && !land ? 2 : (land ? 4 : 2);
  const ps = PRINT_SETS[dash.id] || PRINT_SETS.default;

  const Controls = (
    <>
      <div className="flex items-center gap-2" style={{marginBottom:isMobile?0:18}}>
        <FileText size={17} style={{color:"var(--amber)"}}/><span style={{fontWeight:600,fontSize:16}}>PDF 出力</span>
      </div>
      <div className={isMobile?"flex items-center gap-3":""} style={isMobile?{flexWrap:"wrap"}:{}}>
        <div style={{flex:isMobile?"1 1 120px":undefined}}>
          {!isMobile && <label className="field-label">用紙サイズ</label>}
          <div className="seg" style={{marginBottom:isMobile?0:16}}>
            <button className={size==="A4"?"on":""} onClick={()=>setSize("A4")}>A4</button>
            <button className={size==="A3"?"on":""} onClick={()=>setSize("A3")}>A3</button>
          </div>
        </div>
        <div style={{flex:isMobile?"1 1 120px":undefined}}>
          {!isMobile && <label className="field-label">向き</label>}
          <div className="seg" style={{marginBottom:isMobile?0:22}}>
            <button className={!land?"on":""} onClick={()=>setOrient("portrait")}>縦</button>
            <button className={land?"on":""} onClick={()=>setOrient("landscape")}>横</button>
          </div>
        </div>
      </div>
      {!isMobile && (
        <div className="card" style={{padding:13,background:"var(--paper)",marginBottom:20}}>
          <div className="flex items-center gap-2" style={{fontSize:12,color:"var(--ink-soft)",lineHeight:1.5}}>
            <ShieldCheck size={26} style={{color:"var(--teal)",flexShrink:0}}/>単回使用・短命の署名トークンをヘッダ渡しし、描画完了を待ってキャプチャします。
          </div>
        </div>
      )}
      <button className="btn btn-amber" style={{width:isMobile?"auto":"100%",justifyContent:"center",flexShrink:0}}><FileDown size={16}/> ダウンロード</button>
    </>
  );

  return (
    <div className="kan" style={{minHeight:"100vh",background:"#2A2820",display:"flex",flexDirection:isMobile?"column":"row"}}>
      {isMobile ? (
        <div style={{background:"var(--paper2)",borderBottom:"1px solid var(--line)",padding:"12px 16px",position:"sticky",top:0,zIndex:5}}>
          <button className="btn btn-ghost" onClick={goBack} style={{marginBottom:12}}><ChevronLeft size={16}/> エディタに戻る</button>
          <div className="flex items-center gap-3" style={{flexWrap:"wrap"}}>{Controls}</div>
        </div>
      ) : (
        <div style={{width:260,flexShrink:0,background:"var(--paper2)",borderRight:"1px solid var(--line)",padding:20}}>
          <button className="btn btn-ghost" onClick={goBack} style={{marginBottom:22}}><ChevronLeft size={16}/> エディタに戻る</button>
          {Controls}
        </div>
      )}

      <div className="scroll" style={{flex:1,overflowY:"auto",display:"flex",justifyContent:"center",padding:isMobile?"20px 16px 40px":"40px 24px"}}>
        <div className="fadein" style={{width:pageW,background:"#fff",borderRadius:4,boxShadow:"0 24px 60px -20px #00000088",padding:isMobile?20:32,height:"fit-content"}}>
          <div className="flex items-center justify-between" style={{borderBottom:"2px solid var(--ink)",paddingBottom:12,marginBottom:18}}>
            <div className="flex items-center gap-2"><span className="kanji" style={{fontSize:20}}>観</span><span className="brand" style={{fontSize:isMobile?15:18}}>{dash.title}</span></div>
            <span className="mono" style={{fontSize:isMobile?9:11,color:"var(--ink-soft)"}}>2026-06-06 14:20</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:`repeat(${scaleKpi},1fr)`,gap:10,marginBottom:14}}>
            {ps.kpis.map((k,i)=>(
              <div key={i} style={{border:"1px solid var(--line)",borderRadius:8,padding:"10px 12px"}}>
                <div style={{fontSize:10.5,color:"var(--ink-soft)"}}>{k[0]}</div>
                <div className="mono" style={{fontSize:17,fontWeight:600}}>{k[1]}</div>
              </div>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns: land && !isMobile?"2fr 1fr":"1fr",gap:10}}>
            <div style={{border:"1px solid var(--line)",borderRadius:8,padding:12,height:170}}><div style={{fontSize:12,fontWeight:600,marginBottom:6}}>{ps.line.title}</div><div style={{height:130}}><ChartBody kind="line" cfg={ps.line.cfg}/></div></div>
            <div style={{border:"1px solid var(--line)",borderRadius:8,padding:12,height:170}}><div style={{fontSize:12,fontWeight:600,marginBottom:6}}>{ps.pie.title}</div><div style={{height:130}}><ChartBody kind="pie" cfg={ps.pie.cfg}/></div></div>
          </div>
          <div style={{border:"1px solid var(--line)",borderRadius:8,padding:12,height:170,marginTop:10}}><div style={{fontSize:12,fontWeight:600,marginBottom:6}}>{ps.bar.title}</div><div style={{height:130}}><ChartBody kind="bar" cfg={ps.bar.cfg}/></div></div>
          <div className="mono" style={{textAlign:"right",fontSize:10,color:"var(--ink2)",marginTop:14}}>Kan. Sheets BI · {size} {land?"横":"縦"}</div>
        </div>
      </div>
    </div>
  );
}

/* ====================== Mobile shell chrome ====================== */
function MobileTopBar({ onLogout }) {
  const [menu, setMenu] = useState(false);
  return (
    <div style={{position:"sticky",top:0,zIndex:20,background:"var(--paper2)",borderBottom:"1px solid var(--line)",padding:"12px 16px"}} className="flex items-center justify-between">
      <BrandMark/>
      <div style={{position:"relative"}}>
        <button className="btn-icon" onClick={()=>setMenu(!menu)} style={{padding:4}}><Avatar/></button>
        {menu && (
          <div className="card" style={{position:"absolute",right:0,top:44,padding:8,minWidth:180,boxShadow:"0 12px 30px -12px #1c1a1455",zIndex:30}}>
            <div style={{padding:"6px 10px",fontSize:12,color:"var(--ink-soft)"}}>sato@example.com</div>
            <button className="btn btn-ghost" style={{width:"100%",justifyContent:"center",marginTop:4}} onClick={onLogout}>ログアウト</button>
          </div>
        )}
      </div>
    </div>
  );
}
function MobileNav({ route, go }) {
  return (
    <div className="mnav">
      <button className={route==="list"?"on":""} onClick={()=>go("list")}><LayoutDashboard size={20}/>ダッシュボード</button>
      <button className={route==="datasources"?"on":""} onClick={()=>go("datasources")}><Database size={20}/>データソース</button>
    </div>
  );
}

/* ====================== App Root ====================== */
export default function App() {
  const { w, isMobile, isNarrow } = useViewport();
  const [route, setRoute] = useState("login");
  const [dashboards, setDashboards] = useState(initialDashboards);
  const [sources] = useState(initialDataSources);
  const [activeDash, setActiveDash] = useState(initialDashboards[0]);
  const inShell = route==="list" || route==="datasources";

  return (
    <div className="kan" style={{minHeight:"100vh"}}>
      <style>{STYLE}</style>

      {route==="login" && <Login onLogin={()=>setRoute("list")} isNarrow={isNarrow}/>}

      {inShell && (
        isMobile ? (
          <div className="paperbg" style={{minHeight:"100vh"}}>
            <MobileTopBar onLogout={()=>setRoute("login")}/>
            <main style={{paddingBottom:74}}>
              {route==="list" && <DashboardList dashboards={dashboards} isMobile openDash={(d)=>{setActiveDash(d);setRoute("editor");}} removeDash={(id)=>setDashboards(dashboards.filter(x=>x.id!==id))}/>}
              {route==="datasources" && <DataSources sources={sources} isMobile/>}
            </main>
            <MobileNav route={route} go={setRoute}/>
          </div>
        ) : (
          <div className="paperbg" style={{display:"flex",minHeight:"100vh"}}>
            <Sidebar route={route} go={setRoute} onLogout={()=>setRoute("login")}/>
            <main className="scroll" style={{flex:1,overflowY:"auto",height:"100vh"}}>
              {route==="list" && <DashboardList dashboards={dashboards} openDash={(d)=>{setActiveDash(d);setRoute("editor");}} removeDash={(id)=>setDashboards(dashboards.filter(x=>x.id!==id))}/>}
              {route==="datasources" && <DataSources sources={sources}/>}
            </main>
          </div>
        )
      )}

      {route==="editor" && (
        <div className="paperbg" style={{minHeight:"100vh"}}>
          <Editor key={activeDash.id} dash={activeDash} sources={sources} isMobile={isMobile} goBack={()=>setRoute("list")} openPrint={()=>setRoute("print")}/>
        </div>
      )}

      {route==="print" && <PrintPreview dash={activeDash} goBack={()=>setRoute("editor")} isMobile={isMobile} w={w}/>}
    </div>
  );
}
