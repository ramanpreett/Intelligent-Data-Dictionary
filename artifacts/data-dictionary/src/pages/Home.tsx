import React from "react";
import { Link } from "wouter";
import { ArrowRight, Database, FileSpreadsheet, Lock, Cpu, BarChart, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Home() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-3.5rem)]">
      {/* Hero Section */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-4 py-24 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-5 mix-blend-overlay pointer-events-none"></div>
        <div className="absolute inset-0 border-t border-primary/20 bg-grid-white/[0.02] bg-[size:50px_50px]"></div>
        
        <div className="relative z-10 max-w-4xl mx-auto flex flex-col items-center">
          <div className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-medium text-primary mb-8 backdrop-blur-sm">
            <Zap className="mr-2 h-4 w-4 text-accent" />
            <span className="text-primary font-mono tracking-widest uppercase text-xs">System Online</span>
          </div>
          
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-foreground mb-6">
            Transform Raw Data into <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent glow-text">
              Understandable Intelligence
            </span>
          </h1>
          
          <p className="max-w-[42rem] leading-normal text-muted-foreground sm:text-xl sm:leading-8 mb-10">
            AI-powered data dictionary generation using intelligent schema analysis and Gemini AI. 
            Upload your CSV, and let our precision instruments map your data reality.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4">
            <Link href="/upload" className="w-full sm:w-auto">
              <Button size="lg" className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold border border-primary/50 glow-border">
                <FileSpreadsheet className="mr-2 h-5 w-5" />
                Initialize Upload
              </Button>
            </Link>
            <Link href="/datasets" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="w-full border-primary/50 text-primary hover:bg-primary/10">
                <Database className="mr-2 h-5 w-5" />
                Access Datasets
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 px-4 border-t border-primary/10 bg-background/50 relative">
        <div className="max-w-6xl mx-auto">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold font-mono text-primary mb-4">SYSTEM_CAPABILITIES</h2>
            <p className="text-muted-foreground text-lg">Precision tools for modern data engineering.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="glass-card p-6 rounded-xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Cpu className="h-24 w-24 text-primary" />
              </div>
              <div className="w-12 h-12 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center mb-6">
                <Cpu className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-foreground">AI Schema Analysis</h3>
              <p className="text-muted-foreground">
                Powered by Gemini AI, the system automatically detects column meanings, semantic types, and relationships.
              </p>
            </div>
            
            <div className="glass-card p-6 rounded-xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <BarChart className="h-24 w-24 text-accent" />
              </div>
              <div className="w-12 h-12 rounded-lg bg-accent/10 border border-accent/30 flex items-center justify-center mb-6">
                <BarChart className="h-6 w-6 text-accent" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-foreground">Statistical Profiling</h3>
              <p className="text-muted-foreground">
                Deep profiling of your data. Null distributions, unique value constraints, and data quality scoring.
              </p>
            </div>
            
            <div className="glass-card p-6 rounded-xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Lock className="h-24 w-24 text-primary" />
              </div>
              <div className="w-12 h-12 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center mb-6">
                <Lock className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-foreground">Secure Extraction</h3>
              <p className="text-muted-foreground">
                Your intelligence is locked down. Export comprehensive data dictionaries to CSV for your internal documentation.
              </p>
            </div>
          </div>
        </div>
      </section>
      
      {/* Workflow Section */}
      <section className="py-24 px-4 bg-background relative border-t border-primary/10">
        <div className="max-w-4xl mx-auto">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold font-mono text-primary mb-4">EXECUTION_WORKFLOW</h2>
          </div>
          
          <div className="space-y-8">
            {[
              { step: "01", title: "Upload Raw CSV", desc: "Drag and drop your raw data files into the secure intake zone." },
              { step: "02", title: "Statistical Parsing", desc: "The engine scans rows to infer data types, calculate null percentages, and detect anomalies." },
              { step: "03", title: "AI Augmentation", desc: "Gemini AI interprets column names and generates human-readable business context." },
              { step: "04", title: "Intelligence Export", desc: "Download the compiled data dictionary for your engineering workflows." }
            ].map((item, i) => (
              <div key={i} className="flex gap-6 items-start">
                <div className="flex-shrink-0 font-mono text-xl font-bold text-accent border border-accent/50 bg-accent/10 w-12 h-12 flex items-center justify-center rounded-lg">
                  {item.step}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-foreground mb-2">{item.title}</h3>
                  <p className="text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-16 text-center">
            <Link href="/upload">
              <Button size="lg" className="bg-primary text-primary-foreground font-bold hover:bg-primary/90 glow-border">
                Commence Operations <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
