import React from "react";
import { Link, useLocation } from "wouter";
import { Database, Upload, Home, TerminalSquare } from "lucide-react";
import { cn } from "@/lib/utils";

export function Navbar() {
  const [location] = useLocation();

  const links = [
    { href: "/", label: "Home", icon: Home },
    { href: "/datasets", label: "Datasets", icon: Database },
    { href: "/upload", label: "Upload", icon: Upload },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-primary/20 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 max-w-screen-2xl items-center mx-auto px-4">
        <Link href="/" className="mr-6 flex items-center space-x-2 group">
          <div className="w-8 h-8 bg-primary/10 border border-primary rounded flex items-center justify-center group-hover:bg-primary/20 transition-colors">
            <TerminalSquare className="h-4 w-4 text-primary" />
          </div>
          <span className="font-bold sm:inline-block glow-text font-mono text-primary tracking-tight">
            IDDA_CORE
          </span>
        </Link>
        <div className="flex flex-1 items-center justify-end space-x-2 md:justify-end">
          <nav className="flex items-center space-x-4">
            {links.map(({ href, label, icon: Icon }) => {
              const active = location === href || (href !== "/" && location.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center space-x-1 text-sm font-medium transition-colors hover:text-primary",
                    active ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline-block">{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}
