import { NavLink, useLocation, useNavigate } from "react-router-dom";
import veloopHeaderLogo from "@/assets/veloop-header-logo.png";
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
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-card border-r border-border/60 fixed inset-y-0 left-0 z-30">
        <div className="p-5 border-b border-border/60 flex items-center justify-between">
          <div>
            <img src={veloopHeaderLogo} alt="Veloop" className="h-7 object-contain cursor-pointer" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))', background: 'transparent' }} onClick={() => navigate("/")} />
            <p className="text-xs text-muted-foreground mt-0.5">SR Software</p>
          </div>
          <NotificationBell />
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {allItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-border/60">
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
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition-colors w-full"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-card border-b border-border/60 flex items-center justify-between px-4 z-30">
        <img src={veloopHeaderLogo} alt="Veloop" className="h-6 object-contain cursor-pointer" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))', background: 'transparent' }} onClick={() => navigate("/")} />
        <div className="flex items-center gap-1">
          <NotificationBell />
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2">
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-foreground/20" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-card shadow-xl slide-up">
            <div className="p-5 border-b border-border/60 flex items-center justify-between">
              <img src={veloopHeaderLogo} alt="Veloop" className="h-7 object-contain cursor-pointer" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))', background: 'transparent' }} onClick={() => { navigate("/"); setSidebarOpen(false); }} />
              <button onClick={() => setSidebarOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            <nav className="p-3 space-y-1">
              {allItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`
                  }
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border/60">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                  {profile?.nome?.charAt(0)?.toUpperCase() || "U"}
                </div>
                <div>
                  <p className="text-sm font-semibold">{profile?.nome || "Usuário"}</p>
                  <p className="text-xs text-muted-foreground capitalize">{role}</p>
                </div>
              </div>
              <button onClick={signOut} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition-colors">
                <LogOut className="w-4 h-4" />
                Sair
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Mobile Bottom Nav - macOS Dock style with liquid glass */}
      <div className="md:hidden fixed bottom-3 left-3 right-3 z-30">
        <nav className="flex items-center justify-around py-1 px-2 rounded-[18px] bg-white/15 dark:bg-white/5 border border-white/30 dark:border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.08)]" style={{ backdropFilter: 'blur(60px) saturate(180%)' }}>
          {navItems.slice(0, 5).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0 px-3 py-1 rounded-xl transition-all duration-200 ${
                  isActive
                    ? "text-primary scale-110"
                    : "text-muted-foreground hover:text-foreground active:scale-95"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div className={`relative p-1 rounded-lg transition-all duration-200 ${isActive ? "bg-primary/15 shadow-sm shadow-primary/20" : ""}`}>
                    <item.icon className={`w-4.5 h-4.5 shrink-0 transition-all duration-200 ${isActive ? "text-primary" : ""}`} />
                  </div>
                  <span className={`text-[9px] font-medium truncate max-w-full transition-all duration-200 ${isActive ? "text-primary font-semibold" : ""}`}>
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
