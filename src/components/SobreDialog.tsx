import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Info, Rocket, ShieldCheck, BarChart3, Users, Globe, ExternalLink } from "lucide-react";
import aboutBg from "@/assets/veloop-about-bg.jpg";

const benefits = [
  { icon: Rocket, title: "Gestão Ágil", desc: "Controle total de vendas, estoque e clientes em tempo real." },
  { icon: ShieldCheck, title: "Segurança", desc: "Dados protegidos com criptografia e controle de acesso por função." },
  { icon: BarChart3, title: "Relatórios", desc: "Dashboard inteligente com métricas e gráficos atualizados." },
  { icon: Users, title: "Multi-Vendedor", desc: "Gerenciamento de equipes com permissões personalizadas." },
];

const SobreDialog = () => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-all w-full px-3 py-2 rounded-lg hover:bg-primary/10"
          style={{
            perspective: '800px',
            transition: 'transform 0.3s ease, box-shadow 0.3s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.05) translateZ(8px)';
            e.currentTarget.style.boxShadow = '0 6px 20px hsl(var(--primary) / 0.2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1) translateZ(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <Info className="w-4 h-4" />
          Sobre
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg p-0 overflow-hidden rounded-2xl border-0 shadow-2xl [&>button]:z-50 [&>button]:text-white [&>button]:hover:text-white/80 [&>button]:bg-black/30 [&>button]:rounded-full [&>button]:p-1">
        {/* Background Image */}
        <div className="relative min-h-[520px] flex flex-col">
          <img
            src={aboutBg}
            alt="VELOOP Background"
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
            width={1280}
            height={960}
          />
          {/* Overlay */}
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(135deg, rgba(88,28,235,0.88) 0%, rgba(30,64,175,0.9) 50%, rgba(88,28,235,0.85) 100%)',
            }}
          />

          {/* Content */}
          <div className="relative z-10 flex flex-col gap-5 p-6 pt-8">
            {/* Header */}
            <div className="text-center">
              <h2 className="text-2xl font-bold text-white tracking-tight">VELOOP</h2>
              <p className="text-white/70 text-xs mt-1">Sistema de Gestão — SR SOFTWARE</p>
            </div>

            {/* CEO Info */}
            <div
              className="rounded-xl p-4 text-center"
              style={{
                background: 'rgba(255,255,255,0.1)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255,255,255,0.15)',
              }}
            >
              <p className="text-white/90 text-sm leading-relaxed">
                O <strong className="text-white">VELOOP</strong> é o sistema que gerencia toda a operação da{" "}
                <strong className="text-white">SR SOFTWARE</strong>, liderada pelo CEO{" "}
                <strong className="text-white">Silvio Rodrigues da Cruz Junior</strong> desde 2026.
              </p>
            </div>

            {/* Benefits */}
            <div className="grid grid-cols-2 gap-3">
              {benefits.map((b) => (
                <div
                  key={b.title}
                  className="rounded-xl p-3 flex flex-col gap-1.5"
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  <b.icon className="w-5 h-5 text-cyan-300" />
                  <p className="text-white text-xs font-semibold">{b.title}</p>
                  <p className="text-white/65 text-[10px] leading-snug">{b.desc}</p>
                </div>
              ))}
            </div>

            {/* Website Link */}
            <a
              href="https://www.srsoftwarestore.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white transition-all"
              style={{
                background: 'linear-gradient(135deg, hsl(270,80%,55%), hsl(220,80%,50%))',
                boxShadow: '0 4px 20px rgba(88,28,235,0.4)',
                perspective: '800px',
                transition: 'transform 0.3s ease, box-shadow 0.3s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.03) translateZ(6px)';
                e.currentTarget.style.boxShadow = '0 8px 30px rgba(88,28,235,0.6)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1) translateZ(0)';
                e.currentTarget.style.boxShadow = '0 4px 20px rgba(88,28,235,0.4)';
              }}
            >
              <Globe className="w-4 h-4" />
              www.srsoftwarestore.com
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <p className="text-center text-white/40 text-[10px]">
              © 2026 SR SOFTWARE — Todos os direitos reservados
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SobreDialog;
