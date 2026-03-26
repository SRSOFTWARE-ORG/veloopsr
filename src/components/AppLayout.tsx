import { NavLink, useLocation, useNavigate } from "react-router-dom";
import veloopHeaderLogo from "@/assets/veloop-header-clean.png";
import NotificationBell from "@/components/NotificationBell";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  FileText,
  Shield,
  Settings,
  LogOut,
  Menu,
  X,
  Users,
  CalendarDays,
  Wrench,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import SobreDialog from "@/components/SobreDialog";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/vendas", icon: ShoppingCart, label: "Vendas" },
  { to: "/produtos", icon: Package, label: "Produtos" },
  { to: "/clientes", icon: Users, label: "Clientes" },
  { to: "/assistencia", icon: Wrench, label: "Assistência" },
  { to: "/documentos", icon: FileText, label: "Documentos" },
  { to: "/agenda", icon: CalendarDays, label: "Agenda" },
  { to: "/caixa", icon: Wallet, label: "Caixa" },
  { to: "/seguranca", icon: Shield, label: "Segurança" },
];

const adminItems = [
  { to: "/configuracoes", icon: Settings, label: "Configurações" },
];

const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile, isAdmin, isPrimaryAdmin, isReadOnly, signOut, role } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const allItems = isPrimaryAdmin ? [...navItems, ...adminItems] : navItems;

  return (
    <div className="min-h-screen flex" style={{ background: 'linear-gradient(270deg, hsl(200,80%,50%), hsl(160,60%,45%), hsl(142,70%,50%), hsl(200,80%,50%))', backgroundSize: '200% 100%', animation: 'gradientSlide 3s ease infinite' }}>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-card border-r border-border/60 fixed inset-y-0 left-0 z-30">
        <div className="p-5 flex items-center justify-between">
          <div>
            <img src={veloopHeaderLogo} alt="Veloop" className="h-14 object-contain cursor-pointer" style={{ filter: 'drop-shadow(0 4px 3px rgba(0,0,0,0.25))' }} onClick={() => navigate("/")} />
            <p className="text-xs text-muted-foreground mt-0.5">SR Software</p>
          </div>
          <NotificationBell />
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {allItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-primary/10 text-primary shadow-md"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground hover:shadow-md hover:scale-[1.02] active:scale-[0.98]"
                }`
              }
              style={{ transition: 'transform 0.2s ease, box-shadow 0.2s ease' }}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
              {profile?.nome?.charAt(0)?.toUpperCase() || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{profile?.nome || "Usuário"}</p>
              <p className="text-xs text-muted-foreground capitalize">{role}</p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition-all w-full px-3 py-2 rounded-lg hover:bg-destructive/10 hover:shadow-md hover:scale-[1.02] active:scale-[0.98]"
            style={{ transition: 'transform 0.2s ease, box-shadow 0.2s ease' }}
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-card flex items-center justify-between px-4 z-30">
        <img
          src={veloopHeaderLogo}
          alt="Veloop"
          className="h-12 object-contain cursor-pointer"
          style={{ filter: 'drop-shadow(0 4px 3px rgba(0,0,0,0.25))' }}
          loading="eager"
          decoding="sync"
          onClick={() => navigate("/")}
        />
        <div className="flex items-center gap-1">
          <NotificationBell />
          <button onClick={() => setSidebarOpen((open) => !open)} className="p-2">
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>
      {/* Gradient transition below header */}
      <div
        className="md:hidden fixed top-14 left-0 right-0 h-8 z-20 pointer-events-none"
        style={{
          background: 'linear-gradient(to bottom, hsl(0 0% 100% / 0.85) 0%, hsl(0 0% 100% / 0.4) 40%, transparent 100%)',
        }}
      />

      {/* Mobile Sidebar Overlay */}
      <div
        className={`md:hidden fixed inset-0 z-40 transition-opacity duration-200 ${
          sidebarOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden={!sidebarOpen}
      >
        <div
          className={`absolute inset-0 bg-foreground/20 transition-opacity duration-200 ${
            sidebarOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setSidebarOpen(false)}
        />
        <aside
          className={`absolute left-0 top-0 bottom-0 w-64 bg-card shadow-xl will-change-transform transition-transform duration-200 ease-out ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="p-5 border-b border-border/60 flex items-center justify-between">
            <img
              src={veloopHeaderLogo}
              alt="Veloop"
              className="h-14 object-contain cursor-pointer"
              style={{ filter: 'drop-shadow(0 4px 3px rgba(0,0,0,0.25))' }}
              loading="eager"
              decoding="sync"
              onClick={() => { navigate("/"); setSidebarOpen(false); }}
            />
            <button onClick={() => setSidebarOpen(false)}><X className="w-5 h-5" /></button>
          </div>
          <nav className="p-3 space-y-0.5">
            {allItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-primary/10 text-primary shadow-md"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground hover:shadow-md hover:scale-[1.02] active:scale-[0.98]"
                  }`
                }
                style={{ transition: 'transform 0.2s ease, box-shadow 0.2s ease' }}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                {profile?.nome?.charAt(0)?.toUpperCase() || "U"}
              </div>
              <div>
                <p className="text-sm font-semibold">{profile?.nome || "Usuário"}</p>
                <p className="text-xs text-muted-foreground capitalize">{role}</p>
              </div>
            </div>
            <button onClick={signOut} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition-all px-3 py-2 rounded-lg hover:bg-destructive/10 hover:shadow-md hover:scale-[1.02] active:scale-[0.98]"
              style={{ transition: 'transform 0.2s ease, box-shadow 0.2s ease' }}>
              <LogOut className="w-4 h-4" />
              Sair
            </button>
          </div>
        </aside>
      </div>

      {/* Mobile Bottom Nav - Liquid Glass */}
      <div className="md:hidden fixed bottom-3 left-3 right-3 z-30">
        <nav
          className="flex items-center justify-around py-1.5 px-2 rounded-[22px] border border-white/30"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0.5) 50%, rgba(220,235,255,0.55) 100%)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -1px 0 rgba(255,255,255,0.15)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}
        >
          {navItems.slice(0, 5).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0 px-3 py-1 rounded-2xl transition-all duration-200 ${
                  isActive
                    ? "scale-125 text-info"
                    : "text-muted-foreground hover:text-foreground active:scale-95"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div className={`relative p-1.5 rounded-xl transition-all duration-200 ${isActive ? "bg-info/15" : ""}`}>
                    <item.icon className={`w-5 h-5 shrink-0 transition-all duration-200 ${isActive ? "text-info" : ""}`} />
                  </div>
                  <span className={`text-[9px] font-medium truncate max-w-full transition-all duration-200 ${isActive ? "text-info font-semibold" : ""}`}>
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Main Content */}
      <main className="flex-1 md:ml-64 pt-14 md:pt-0 w-full min-w-0 overflow-x-hidden">
        {children}
      </main>
    </div>
  );
};

export default AppLayout;
