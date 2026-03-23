import { NavLink, useLocation } from "react-router-dom";
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
  { to: "/seguranca", icon: Shield, label: "Segurança" },
];

const adminItems = [
  { to: "/configuracoes", icon: Settings, label: "Configurações" },
];

const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile, isAdmin, signOut, role } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  const allItems = isAdmin ? [...navItems, ...adminItems] : navItems;

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-card border-r border-border/60 fixed inset-y-0 left-0 z-30">
        <div className="p-5 border-b border-border/60">
          <h1 className="text-xl font-extrabold tracking-tight text-primary">Veloop</h1>
          <p className="text-xs text-muted-foreground mt-0.5">SR Software</p>
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
        <h1 className="text-lg font-extrabold text-primary">Veloop</h1>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2">
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-foreground/20" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-card shadow-xl slide-up">
            <div className="p-5 border-b border-border/60 flex items-center justify-between">
              <h1 className="text-xl font-extrabold text-primary">Veloop</h1>
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

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border/60 z-30 flex py-1.5 px-0.5 overflow-hidden">
        {navItems.slice(0, 5).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 py-1 rounded-lg text-xs transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`
            }
          >
            <item.icon className="w-5 h-5 shrink-0" />
            <span className="text-[10px] font-medium truncate max-w-full px-0.5">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Main Content */}
      <main className="flex-1 md:ml-64 pt-14 md:pt-0">
        {children}
      </main>
    </div>
  );
};

export default AppLayout;
