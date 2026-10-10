import type { AnchorHTMLAttributes } from "react";
import { buildDashboard } from "./dashboard-calculations";
import { addDays } from "./fixture-time";
import type { DashboardQuery,PayPlan,PortalDay } from "./dashboard-types";
export default function Link(props:AnchorHTMLAttributes<HTMLAnchorElement>){return <a {...props} href="#" onClick={e=>e.preventDefault()}/>;}
export const useRouter=()=>({replace:()=>undefined});
const today="2026-01-15";
let plan:PayPlan={revision:1,profiles:["Demo One","Demo Two"].map((name,i)=>({id:"demo-"+i,name,inspector:name,hourlyCents:2300,mondayCents:null,standardMinutes:600,shiftsPerWeek:5,availableWeekdays:[1,2,3,4,5,6],scheduledWeekdays:[1,2,3,4,5],commissionEligible:true,approximate:false})),adjustments:[]};
const days:PortalDay[]=Array.from({length:31},(_,i)=>{const total=i===0?95:60+(i*7)%50;const second=Math.floor(total*.26),first=total-second;return {date:addDays(today,-i),total,passed:total-20,failed:18,aborted:2,other:0,verifiedEmpty:false,retrievedAt:"2026-01-15T20:30:00.000Z",inspectors:[{inspector:"Demo One",total:first,passed:first-14,failed:12,aborted:2,other:0},{inspector:"Demo Two",total:second,passed:second-6,failed:6,aborted:0,other:0}]};});
export function initial(){const p=new URLSearchParams(location.search);const start=p.get("start")||today;const query:DashboardQuery={start,end:p.get("end")||start,trendDays:p.get("trendDays")==="30"?30:7,employee:p.get("employee")||undefined};return buildDashboard(query,today,days,plan);}
export async function getPerformanceDashboardAction(query:DashboardQuery){return {ok:true,data:buildDashboard(query,today,days,plan)};}
export async function savePerformancePayPlanAction(value:PayPlan,query:DashboardQuery){plan={...value,revision:plan.revision+1};return {ok:true,data:buildDashboard(query,today,days,plan)};}
