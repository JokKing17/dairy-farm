import { ChartNoAxesCombined, Milk, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getSession()) redirect("/dashboard");
  return (
    <main className="login">
      <section className="login-art">
        <div className="brand"><b className="brandmark"><Milk /></b><span>DairyFlow</span></div>
        <div>
          <h1>Every liter accounted for. Every rupee understood.</h1>
          <p>Procurement, deliveries, production, stock, ledgers and daily cash—one secure workspace for your dairy business.</p>
        </div>
        <div className="login-features">
          <span><ShieldCheck size={16} /> Role-based access</span>
          <span><ChartNoAxesCombined size={16} /> Live business insight</span>
        </div>
      </section>
      <section className="login-form"><LoginForm /></section>
    </main>
  );
}
