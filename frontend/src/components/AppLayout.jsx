import { useAuth } from "../context/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";

export default function AppLayout({ title, children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem("sentinel_theme") === "dark";
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("sentinel_theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("sentinel_theme", "light");
    }
  }, [isDarkMode]);

  /* ---------- RESPONSIVE WATCH ---------- */
  useEffect(() => {
    const onResize = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth >= 768) setMobileOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const navItem = (label, path, iconSvg) => {
    const isActive = location.pathname === path;
    const showLabel = !collapsed || isMobile;

    return (
      <button
        onClick={() => {
          navigate(path);
          setMobileOpen(false);
        }}
        title={!showLabel ? label : undefined}
        style={{
          textAlign: "left",
          padding: showLabel ? "12px 16px" : "12px 0",
          borderRadius: "var(--radius-md)",
          border: "none",
          cursor: "pointer",
          background: isActive ? "var(--color-primary)" : "transparent",
          color: isActive ? "#FFFFFF" : "var(--color-sidebar-text)",
          fontWeight: 500,
          transition: "all var(--transition-fast)",
          display: "flex",
          alignItems: "center",
          justifyContent: showLabel ? "flex-start" : "center",
          gap: "14px",
          opacity: isActive ? 1 : 0.7,
          boxShadow: isActive ? "var(--shadow-sm)" : "none",
        }}
        onMouseEnter={(e) => {
          if (!isActive) {
            e.currentTarget.style.background = "var(--color-sidebar-hover)";
            e.currentTarget.style.opacity = "1";
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.opacity = "0.7";
          }
        }}
      >
        <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "20px" }} dangerouslySetInnerHTML={{ __html: iconSvg }} />
        {showLabel && <span style={{ whiteSpace: "nowrap" }}>{label}</span>}
      </button>
    );
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        background: "var(--color-bg-body)",
      }}
    >
      {/* MOBILE OVERLAY */}
      {isMobile && mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.3)",
            zIndex: 40,
          }}
        />
      )}

      {/* SIDEBAR */}
      <aside
        style={{
          position: isMobile ? "fixed" : "relative",
          zIndex: 50,
          width: collapsed && !isMobile ? 80 : 260,
          height: "100%",
          background: "var(--color-sidebar)",
          color: "var(--color-sidebar-text)",
          padding: collapsed && !isMobile ? "20px 12px" : "20px",
          transform: isMobile
            ? mobileOpen
              ? "translateX(0)"
              : "translateX(-100%)"
            : "none",
          transition: "all var(--transition-normal)",
          flexShrink: 0,
          boxShadow: "var(--shadow-lg)",
          overflowX: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: collapsed && !isMobile ? "center" : "space-between",
            alignItems: "center",
            marginBottom: 32,
            minHeight: "32px",
          }}
        >
          {!collapsed && !isMobile && (
            <h2 style={{ margin: 0, color: "var(--color-sidebar-text)", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>Sentinel</h2>
          )}
          <button
            onClick={() =>
              isMobile ? setMobileOpen(false) : setCollapsed(!collapsed)
            }
            style={{
              border: "none",
              background: "transparent",
              color: "var(--color-sidebar-text)",
              cursor: "pointer",
              fontSize: 20,
              padding: "4px",
              opacity: 0.8,
              transition: "var(--transition-fast)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.8")}
          >
            ☰
          </button>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {navItem("Dashboard", "/admin/dashboard", `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9"></rect><rect x="14" y="3" width="7" height="5"></rect><rect x="14" y="12" width="7" height="9"></rect><rect x="3" y="16" width="7" height="5"></rect></svg>`)}
          {navItem("Tasks", "/admin/tasks", `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`)}
          {navItem("Members", "/admin/members", `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`)}
          {navItem("Reports", "/admin/reports", `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>`)}
        </nav>
      </aside>

      {/* MAIN */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* HEADER */}
        <header
          style={{
            height: 64,
            background: "var(--color-bg-card)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            borderBottom: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 32px",
            flexShrink: 0,
            boxShadow: "var(--shadow-sm)",
            zIndex: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {isMobile && (
              <button
                onClick={() => setMobileOpen(true)}
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: 20,
                  cursor: "pointer",
                }}
              >
                ☰
              </button>
            )}
            <h3 style={{ margin: 0 }}>{title}</h3>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--color-text-main)",
                fontSize: 18,
                padding: "4px",
                display: "flex",
                alignItems: "center"
              }}
              title="Toggle Dark Mode"
            >
              {isDarkMode ? "☀️" : "🌙"}
            </button>
            {!isMobile && <span style={{ fontWeight: 500, color: "var(--color-text-main)" }}>{user?.name}</span>}
            <button
              onClick={() => {
                logout();
                navigate("/login");
              }}
              style={{
                background: "var(--color-danger)",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "var(--radius-md)",
                padding: "8px 16px",
                fontWeight: 500,
                cursor: "pointer",
                transition: "var(--transition-fast)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--color-danger-hover)";
                e.currentTarget.style.transform = "scale(0.98)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--color-danger)";
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              Logout
            </button>
          </div>
        </header>

        {/* CONTENT */}
        <section
          key={location.pathname} // Forces remount and re-trigger animation on route change
          className="animate-fade-in"
          style={{
            flex: 1,
            padding: isMobile ? 16 : 32,
            overflowY: "auto",
            overflowX: "hidden",
            background: "var(--color-bg-body)",
          }}
        >
          {children}
        </section>
      </main>
    </div>
  );
}
