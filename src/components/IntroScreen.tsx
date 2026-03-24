import { useState, useEffect } from "react";

const IntroScreen = ({ onFinish }: { onFinish: () => void }) => {
  const [phase, setPhase] = useState<"enter" | "particles" | "logo" | "text" | "exit">("enter");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("particles"), 50);
    const t2 = setTimeout(() => setPhase("logo"), 600);
    const t3 = setTimeout(() => setPhase("text"), 1800);
    const t4 = setTimeout(() => setPhase("exit"), 3400);
    const t5 = setTimeout(() => onFinish(), 4200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); clearTimeout(t5); };
  }, []);

  const pastEnter = phase !== "enter";
  const showLogo = phase === "logo" || phase === "text" || phase === "exit";
  const showText = phase === "text" || phase === "exit";
  const isExit = phase === "exit";

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
      style={{
        background: "radial-gradient(ellipse at 50% 40%, #f0f4f8 0%, #dce3eb 50%, #c8d3df 100%)",
        opacity: isExit ? 0 : 1,
        transform: isExit ? "scale(1.08)" : "scale(1)",
        transition: "opacity 0.8s cubic-bezier(0.4,0,0.2,1), transform 0.8s cubic-bezier(0.4,0,0.2,1)",
      }}
    >
      {/* Animated background rings */}
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="absolute rounded-full pointer-events-none"
          style={{
            width: `${280 + i * 180}px`,
            height: `${280 + i * 180}px`,
            border: `1px solid rgba(100, 130, 170, ${0.12 - i * 0.03})`,
            opacity: pastEnter ? 1 : 0,
            transform: pastEnter ? "scale(1)" : "scale(0.5)",
            transition: `opacity ${0.8 + i * 0.3}s ease-out ${i * 0.15}s, transform ${1 + i * 0.3}s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.15}s`,
            animation: pastEnter ? `ringPulse ${4 + i}s ease-in-out ${i * 0.5}s infinite` : "none",
          }}
        />
      ))}

      {/* Floating particles */}
      {Array.from({ length: 12 }).map((_, i) => {
        const angle = (i / 12) * 360;
        const radius = 120 + (i % 3) * 60;
        const size = 3 + (i % 4);
        return (
          <div
            key={`p${i}`}
            className="absolute rounded-full pointer-events-none"
            style={{
              width: `${size}px`,
              height: `${size}px`,
              background: `rgba(80, 120, 180, ${0.15 + (i % 5) * 0.05})`,
              opacity: pastEnter ? 1 : 0,
              transform: pastEnter
                ? `translate(${Math.cos(angle * Math.PI / 180) * radius}px, ${Math.sin(angle * Math.PI / 180) * radius}px)`
                : "translate(0, 0) scale(0)",
              transition: `all ${1.2}s cubic-bezier(0.16, 1, 0.3, 1) ${0.3 + i * 0.06}s`,
              animation: pastEnter ? `particleFloat ${3 + (i % 3)}s ease-in-out ${i * 0.2}s infinite alternate` : "none",
            }}
          />
        );
      })}

      {/* Glow behind logo */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: "400px",
          height: "400px",
          background: "radial-gradient(circle, rgba(70,130,220,0.12) 0%, transparent 70%)",
          opacity: showLogo ? 1 : 0,
          transform: showLogo ? "scale(1)" : "scale(0.3)",
          transition: "opacity 1s ease-out, transform 1.2s cubic-bezier(0.16, 1, 0.3, 1)",
          animation: showLogo ? "glowPulse 3s ease-in-out infinite" : "none",
        }}
      />

      <div className="relative flex flex-col items-center gap-0">
        {/* Logo with dramatic zoom-in entrance */}
        <div
          style={{
            transform: showLogo
              ? "scale(1) translateY(0) rotate(0deg)"
              : "scale(0.15) translateY(60px) rotate(-5deg)",
            opacity: showLogo ? 1 : 0,
            filter: showLogo ? "blur(0px)" : "blur(8px)",
            transition:
              "transform 1.1s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.6s ease-out, filter 0.8s ease-out",
          }}
        >
          <img
            src="/images/veloop-logo.png"
            alt="Veloop"
            className="drop-shadow-2xl"
            style={{
              width: "min(85vw, 85vh, 520px)",
              height: "auto",
              animation: showLogo ? "logoBreathe 4s ease-in-out infinite" : "none",
            }}
          />

          {/* Shine sweep effect */}
          <div
            className="absolute inset-0 overflow-hidden pointer-events-none"
            style={{
              maskImage: "url(/images/veloop-logo.png)",
              maskSize: "contain",
              maskRepeat: "no-repeat",
              maskPosition: "center",
              WebkitMaskImage: "url(/images/veloop-logo.png)",
              WebkitMaskSize: "contain",
              WebkitMaskRepeat: "no-repeat",
              WebkitMaskPosition: "center",
            }}
          >
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.5) 40%, rgba(255,255,255,0.95) 50%, rgba(255,255,255,0.5) 60%, transparent 70%)",
                animation: showLogo ? "shineSweep 3s 0.6s ease-in-out infinite" : "none",
              }}
            />
          </div>
        </div>

        {/* Tagline with typewriter-like reveal */}
        <div
          className="overflow-hidden"
          style={{
            marginTop: "-6px",
            maxWidth: showText ? "400px" : "0px",
            opacity: showText ? 1 : 0,
            transition: "max-width 1s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.6s ease-out 0.1s",
          }}
        >
          <p
            className="text-center font-bold tracking-[0.3em] uppercase select-none whitespace-nowrap"
            style={{
              fontSize: "clamp(0.65rem, 2.5vw, 1rem)",
              color: "#3a4a5c",
              transform: showText ? "translateY(0)" : "translateY(12px)",
              transition: "transform 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.15s",
            }}
          >
            TUDO EM UM SÓ APP
          </p>
        </div>

        {/* Accent line under text */}
        <div
          style={{
            width: showText ? "60px" : "0px",
            height: "2px",
            background: "linear-gradient(90deg, transparent, #5a7da8, transparent)",
            marginTop: "10px",
            transition: "width 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.3s",
          }}
        />
      </div>

      <style>{`
        @keyframes shineSweep {
          0% { transform: translateX(-200%); }
          30% { transform: translateX(200%); }
          100% { transform: translateX(200%); }
        }
        @keyframes ringPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.06); opacity: 0.6; }
        }
        @keyframes particleFloat {
          0% { transform: translate(var(--tx, 0), var(--ty, 0)) scale(1); }
          100% { transform: translate(var(--tx, 0), var(--ty, 0)) scale(1.4) translateY(-8px); }
        }
        @keyframes glowPulse {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.15); opacity: 1; }
        }
        @keyframes logoBreathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }
      `}</style>
    </div>
  );
};

export default IntroScreen;
