import { useState, useEffect } from "react";

const IntroScreen = ({ onFinish }: { onFinish: () => void }) => {
  const [phase, setPhase] = useState<"enter" | "logo" | "text" | "exit">("enter");

  useEffect(() => {
    const logoTimer = setTimeout(() => setPhase("logo"), 100);
    const textTimer = setTimeout(() => setPhase("text"), 1200);
    const exitTimer = setTimeout(() => setPhase("exit"), 3300);
    const finishTimer = setTimeout(() => onFinish(), 4000);
    return () => {
      clearTimeout(logoTimer);
      clearTimeout(textTimer);
      clearTimeout(exitTimer);
      clearTimeout(finishTimer);
    };
  }, []);

  const showLogo = phase !== "enter";
  const showText = phase === "text" || phase === "exit";
  const isExit = phase === "exit";

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden`}
      style={{
        background: "linear-gradient(145deg, #edf2f7 0%, #dfe6ed 40%, #e2e8f0 100%)",
        opacity: isExit ? 0 : 1,
        transition: "opacity 0.7s ease-out",
      }}
    >
      <div className="relative flex flex-col items-center gap-0">
        {/* Logo with dramatic bounce entrance */}
        <div
          style={{
            transform: showLogo
              ? "scale(1) translateY(0)"
              : "scale(0.3) translateY(40px)",
            opacity: showLogo ? 1 : 0,
            transition: "transform 1s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.6s ease-out",
          }}
        >
          <img
            src="/images/veloop-logo.png"
            alt="Veloop"
            className="drop-shadow-2xl"
            style={{
              width: "min(85vw, 85vh, 520px)",
              height: "auto",
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
                  "linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.6) 42%, rgba(255,255,255,0.95) 50%, rgba(255,255,255,0.6) 58%, transparent 65%)",
                animation: showLogo ? "shineSweep 2.8s 0.8s ease-in-out infinite" : "none",
              }}
            />
          </div>
        </div>

        {/* Tagline with separate delayed entrance */}
        <p
          className="text-center font-bold tracking-[0.25em] uppercase select-none"
          style={{
            fontSize: "clamp(0.7rem, 2.5vw, 1.1rem)",
            color: "#3a4a5c",
            letterSpacing: "0.3em",
            marginTop: "-8px",
            transform: showText ? "translateY(0)" : "translateY(20px)",
            opacity: showText ? 1 : 0,
            transition: "transform 0.8s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.8s ease-out",
          }}
        >
          TUDO EM UM SÓ APP
        </p>
      </div>

      <style>{`
        @keyframes shineSweep {
          0% { transform: translateX(-180%); }
          35% { transform: translateX(180%); }
          100% { transform: translateX(180%); }
        }
      `}</style>
    </div>
  );
};

export default IntroScreen;
