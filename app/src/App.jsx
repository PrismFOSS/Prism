import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AlertTriangle, RefreshCw, Info } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import MainLayout from '@/components/layouts/MainLayout';
import Overview from '@/pages/server/Overview';
import FileManagerPage from './pages/server/FileManagerPage';
import PluginManagerPage from './pages/server/PluginManagerPage';
import ConsolePage from './pages/server/ConsolePage';
import Network from './pages/server/Network';
import UserManagerPage from './pages/server/UserManagerPage'
import Players from './pages/server/Players';
import Backups from './pages/server/Backups';
import Settings from './pages/server/Settings';

import Dashboard from './pages/Dashboard';
import Auth from './pages/Auth';
import NotFound from './pages/NotFound';

import AFKPage from './pages/coins/AFKPage';
import Store from './pages/coins/Store';
import ReferralsPage from './pages/Referrals';
import Tickets from './pages/SupportTickets';
import AccountPage from './pages/Account';

import AdminOverview from './pages/admin/Overview';
import AdminTickets from './pages/admin/Tickets';
import Users from './pages/admin/Users';
import Nodes from './pages/admin/Nodes';
import Radar from './pages/admin/Radar';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false,
      error: null,
      countdown: 3
    };
  }

  static getDerivedStateFromError(error) {
    return { 
      hasError: true,
      error: error
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  componentDidUpdate(prevProps, prevState) {
    if (this.state.hasError && !prevState.hasError) {
      this.startCountdown();
    }
  }

  startCountdown = () => {
    this.countdownInterval = setInterval(() => {
      this.setState(state => ({
        countdown: state.countdown - 1
      }), () => {
        if (this.state.countdown === 0) {
          clearInterval(this.countdownInterval);
          window.location.reload();
        }
      });
    }, 1000);
  }

  componentWillUnmount() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }
  }

  handleRefreshNow = () => {
    window.location.reload();
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <CardTitle>Something went wrong with Prism</CardTitle>
              </div>
              <CardDescription>
                An error occurred while rendering the page.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4 text-sm font-mono overflow-auto max-h-[200px]">
                {this.state.error?.message || 'Unknown error'}
              </div>
              
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="system-info">
                  <AccordionTrigger className="text-sm">
                    <div className="flex items-center gap-2">
                      <Info className="h-4 w-4" />
                      System information
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <p>Version: Prism 0.5.0</p>
                      <p>Codename: Adelante</p>
                      <p>Platform: 130</p>
                      <p>User Agent: {navigator.userAgent}</p>
                      <p>Timestamp: {new Date().toISOString()}</p>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Refreshing in {this.state.countdown}...
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={this.handleRefreshNow}
                  className="gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh Now
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

// Root redirect component that checks auth state
const RootRedirect = () => {
  return <Navigate to={'/dashboard'} replace />;
};

// Protected Route
const ProtectedRoute = ({ children }) => {
  const [isChecking, setIsChecking] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/v5/state', {
          credentials: 'include',
        });
        
        if (!response.ok) {
          throw new Error('Unauthorized');
        }
        
        setIsChecking(false);
      } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/auth';
      }
    };

    checkAuth();
  }, [navigate]);

  if (isChecking) {
    return null;
  }

  return children;
};

export default function App() {
  return (
    <ErrorBoundary>
      <div className="dark">
        <Routes>
          {/* Root route with conditional redirect */}
          <Route path="/" element={<RootRedirect />} />
          
          {/* Protected routes */}
          <Route 
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/server/:id/overview" element={<Overview />} />
            <Route path="/server/:id/console" element={<ConsolePage />} />
            <Route path="/server/:id/files" element={<FileManagerPage />} />
            <Route path="/server/:id/plugins" element={<PluginManagerPage />} />
            <Route path="/server/:id/network" element={<Network />} />
            <Route path="/server/:id/users" element={<UserManagerPage />} />
            <Route path="/server/:id/players" element={<Players />} />
            <Route path="/server/:id/backups" element={<Backups />} />
            <Route path="/server/:id/settings" element={<Settings />} />

            {/* Dashboard routes */}
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/coins/afk" element={<AFKPage />} />
            <Route path="/coins/store" element={<Store />} />
            <Route path="/referrals" element={<ReferralsPage />} />
            <Route path="/tickets" element={<Tickets />} />
            <Route path="/account" element={<AccountPage />} />

            {/* Admin routes */}
            <Route path="/admin/overview" element={<AdminOverview />} />
            <Route path="/admin/users" element={<Users />} />
            <Route path="/admin/nodes" element={<Nodes />} />
            <Route path="/admin/radar" element={<Radar />} />
            <Route path="/admin/tickets" element={<AdminTickets />} />
          </Route>

          {/* Auth route */}
          <Route path="/auth" element={<Auth />} />
          
          {/* 404 catch-all route */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </ErrorBoundary>
  );
}