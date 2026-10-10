import "./_group.css";
import {PerformanceDashboard} from "./performance-dashboard";import {initial} from "./mock-actions";
export default function Preview(){return <div style={{padding:28,background:"var(--bg)",minHeight:"100vh"}}><div style={{fontSize:11,color:"var(--muted)",marginBottom:16}}>SYNTHETIC PREVIEW · The app uses live station data</div><PerformanceDashboard initial={initial()}/></div>;}
