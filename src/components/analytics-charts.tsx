"use client";

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

const colors = ["#0f6b52", "#2563eb", "#d97706", "#7c3aed", "#dc2626", "#0891b2"];
const money = (value: number) => `PKR ${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(value)}`;

export type ChartDatum = { name: string; [key: string]: string | number };

export function ChartCard({ title, description, children, summary }: { title: string; description: string; children: React.ReactNode; summary: string }) {
  return <article className="chart-card"><div className="chart-heading"><h3>{title}</h3><p>{description}</p></div><div className="chart-frame">{children}</div><p className="chart-summary"><span className="sr-only">Chart summary: </span>{summary}</p></article>;
}

export function TrendChart({ data, keys, moneyValues = false }: { data: ChartDatum[]; keys: { key: string; label: string; color?: string }[]; moneyValues?: boolean }) {
  return <ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}><defs>{keys.map((item, index) => <linearGradient key={item.key} id={`fill-${item.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={item.color ?? colors[index]} stopOpacity={0.28}/><stop offset="95%" stopColor={item.color ?? colors[index]} stopOpacity={0}/></linearGradient>)}</defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8e5"/><XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#7b8b84"/><YAxis tick={{ fontSize: 11 }} stroke="#7b8b84" tickFormatter={value => moneyValues ? `${Math.round(Number(value) / 1000)}k` : String(value)}/><Tooltip formatter={(value) => moneyValues ? money(Number(value)) : Number(value).toLocaleString("en-PK")}/><Legend />{keys.map((item, index) => <Area key={item.key} type="monotone" dataKey={item.key} name={item.label} stroke={item.color ?? colors[index]} fill={`url(#fill-${item.key})`} strokeWidth={2} connectNulls={false}/>)}</AreaChart></ResponsiveContainer>;
}

export function CompositionChart({ data, moneyValues = false }: { data: ChartDatum[]; moneyValues?: boolean }) {
  return <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="78%" paddingAngle={2}>{data.map((row, index) => <Cell key={row.name} fill={colors[index % colors.length]} />)}</Pie><Tooltip formatter={(value) => moneyValues ? money(Number(value)) : Number(value).toLocaleString("en-PK")}/><Legend verticalAlign="bottom" height={32}/></PieChart></ResponsiveContainer>;
}

export function RankingChart({ data, moneyValues = false, dataKey = "value" }: { data: ChartDatum[]; moneyValues?: boolean; dataKey?: string }) {
  return <ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical" margin={{ left: 16, right: 20 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8e5"/><XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={value => moneyValues ? `${Math.round(Number(value) / 1000)}k` : String(value)}/><YAxis dataKey="name" type="category" width={92} tick={{ fontSize: 11 }}/><Tooltip formatter={(value) => moneyValues ? money(Number(value)) : Number(value).toLocaleString("en-PK")}/><Bar dataKey={dataKey} fill={colors[0]} radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer>;
}

export function GroupedBarChart({ data, keys, reference }: { data: ChartDatum[]; keys: { key: string; label: string; color?: string }[]; reference?: number }) {
  return <ResponsiveContainer width="100%" height="100%"><BarChart data={data}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8e5"/><XAxis dataKey="name" tick={{ fontSize: 11 }}/><YAxis tick={{ fontSize: 11 }}/><Tooltip/><Legend/>{reference !== undefined ? <ReferenceLine y={reference} stroke="#dc2626" strokeDasharray="5 5" label="Standard" /> : null}{keys.map((item, index) => <Bar key={item.key} dataKey={item.key} name={item.label} fill={item.color ?? colors[index]} radius={[4,4,0,0]} />)}</BarChart></ResponsiveContainer>;
}

export function YieldLineChart({ data }: { data: ChartDatum[] }) {
  return <ResponsiveContainer width="100%" height="100%"><LineChart data={data}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name" tick={{fontSize:11}}/><YAxis domain={[0,100]} unit="%"/><Tooltip formatter={value => `${Number(value).toFixed(1)}%`}/><Legend/><ReferenceLine y={85} stroke="#d97706" strokeDasharray="5 5" label="85% standard"/><Line type="linear" dataKey="yield" name="Actual yield" stroke="#0f6b52" strokeWidth={2} dot={{r:3}} connectNulls={false}/></LineChart></ResponsiveContainer>;
}
