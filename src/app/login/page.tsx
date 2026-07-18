import { ChartNoAxesCombined, Milk, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getSession()) redirect("/dashboard");
  return <main className="login">
    <section className="login-art" aria-labelledby="login-hero-title">
      <div className="login-decoration login-decoration-one" aria-hidden="true"/>
      <div className="login-decoration login-decoration-two" aria-hidden="true"/>
      <div className="login-brand"><b className="login-brandmark"><Milk aria-hidden="true"/></b><span>DairyFlow</span></div>
      <div className="login-hero"><h1 id="login-hero-title">Every liter accounted for. Every rupee understood.</h1><p>Procurement, deliveries, production, stock, ledgers and daily cash—one secure workspace for your dairy business.</p></div>
      <div className="login-features"><span><ShieldCheck size={16}/> Role-based access</span><span><ChartNoAxesCombined size={16}/> Live business insight</span></div>
    </section>
    <section className="login-form" aria-label="Sign in"><LoginForm/></section>
  </main>;
}
