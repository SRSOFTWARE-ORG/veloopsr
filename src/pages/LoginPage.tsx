import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Lock, Mail, User } from "lucide-react";
import veloopLogo from "@/assets/veloop-logo-transparent.png";

const LoginPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [loading, setLoading] = useState(false);
  const [manterLogado, setManterLogado] = useState(() => {
    return localStorage.getItem("veloop_manter_logado") === "true";
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        localStorage.setItem("veloop_manter_logado", manterLogado.toString());
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Login realizado com sucesso!");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { nome } },
        });
        if (error) throw error;
        toast.success("Conta criada! Verifique seu email.");
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao autenticar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/40 flex items-center justify-center p-4">
      <div className="w-full max-w-[900px] bg-card rounded-xl shadow-xl overflow-hidden flex flex-col md:flex-row min-h-[500px]">
        {/* Left - Logo */}
        <div className="flex-1 flex items-center justify-center p-10" style={{ background: 'linear-gradient(270deg, hsl(200,80%,50%), hsl(160,60%,45%), hsl(142,70%,50%), hsl(200,80%,50%))', backgroundSize: '200% 100%', animation: 'gradientSlide 3s ease infinite' }}>
          <img
            src={veloopLogo}
            alt="Logo Veloop"
            className="max-w-[130%] max-h-[600px] object-contain drop-shadow-2xl mix-blend-multiply"
            style={{
              WebkitMaskImage: "radial-gradient(circle, rgba(0,0,0,1) 54%, rgba(0,0,0,0.96) 64%, rgba(0,0,0,0.78) 74%, rgba(0,0,0,0.42) 84%, rgba(0,0,0,0) 100%)",
              maskImage: "radial-gradient(circle, rgba(0,0,0,1) 54%, rgba(0,0,0,0.96) 64%, rgba(0,0,0,0.78) 74%, rgba(0,0,0,0.42) 84%, rgba(0,0,0,0) 100%)",
            }}
          />
        </div>

        {/* Right - Form */}
        <div className="flex-1 p-8 md:p-12 flex flex-col justify-center">
          <h2 className="text-2xl font-bold text-foreground mb-6">
            {isLogin ? "Entrar" : "Criar Conta"}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Nome completo"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="pl-10 h-12 rounded-lg border-border/60 focus:border-primary"
                  required={!isLogin}
                />
              </div>
            )}

            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 h-12 rounded-lg border-border/60 focus:border-primary"
                required
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="password"
                placeholder="Senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 h-12 rounded-lg border-border/60 focus:border-primary"
                required
                minLength={6}
              />
            </div>

            {isLogin && (
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="manter-logado"
                    checked={manterLogado}
                    onCheckedChange={(checked) => setManterLogado(checked === true)}
                  />
                  <label htmlFor="manter-logado" className="text-muted-foreground cursor-pointer select-none">
                    Manter conectado
                  </label>
                </div>
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-12 rounded-lg text-base font-semibold text-white border-0 hover:opacity-90"
              style={{ background: 'linear-gradient(270deg, hsl(200,80%,50%), hsl(160,60%,45%), hsl(142,70%,50%), hsl(200,80%,50%))', backgroundSize: '200% 100%', animation: 'gradientSlide 3s ease infinite' }}
              disabled={loading}
            >
              {loading ? "Carregando..." : isLogin ? "Entrar" : "Criar Conta"}
            </Button>
          </form>

          <button
            onClick={() => setIsLogin(!isLogin)}
            className="w-full text-center mt-5 text-sm text-primary hover:underline transition-colors"
          >
            {isLogin ? "Não tem conta? Cadastre-se" : "Já tem conta? Faça login"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
