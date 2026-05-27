import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Navbar } from "@/components/layout/Navbar";
import { Home } from "@/pages/Home";
import { Upload } from "@/pages/Upload";
import { DatasetsList } from "@/pages/DatasetsList";
import { DatasetDetail } from "@/pages/DatasetDetail";

const queryClient = new QueryClient();

function Router() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      <Navbar />
      <main className="flex-1">
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/upload" component={Upload} />
          <Route path="/datasets" component={DatasetsList} />
          <Route path="/datasets/:id" component={DatasetDetail} />
          <Route path="/datasets/:id/analyze">
            {(params: { id?: string }) => {
              window.location.href = `/datasets/${params.id}`;
              return null;
            }}
          </Route>
          <Route component={NotFound} />
        </Switch>
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, "") || ""}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
