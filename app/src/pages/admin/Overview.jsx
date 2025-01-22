import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Settings,
  RefreshCw,
  AlertCircle,
  Save,
  Archive,
  Terminal,
  FileCode,
  Upload,
  Check,
  Clock,
  RotateCcw,
  ShieldAlert,
  Users,
  Server,
  Database,
  ChevronRight,
  Box,
  CircuitBoard,
  Rocket
} from 'lucide-react';
import axios from 'axios';

// Welcome Modal Component
function WelcomeModal({ isOpen, onClose }) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const handleClose = () => {
    if (dontShowAgain) {
      localStorage.setItem('prismWelcomeShown', 'true');
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <div className="py-10">
          <div className="relative space-y-4">
            <img src="https://i.imgur.com/ZLb7kak.png" alt="Prism Logo" className="w-auto h-12 mb-6" />
            <h2 className="text-3xl font-bold text-black">Prism 0.5 (Adelante)</h2>
            <p className="text-neutral-700 max-w-lg">
              The next generation of Prism is here. New year, new look, new features and improvements. We're excited to have you join us now that you've upgraded from Heliactyl!
            </p>
            <div className="flex space-x-4 items-center">
            <Checkbox 
              id="dontShowAgain" 
              checked={dontShowAgain} 
              onCheckedChange={setDontShowAgain}
              className="text-primary-500"
            />
            <label 
              htmlFor="dontShowAgain" 
              className="text-sm text-neutral-600 cursor-pointer"
            >
              Don't show this again
            </label>
            </div>
          </div>
        </div>
        <DialogFooter className="flex-col space-y-4">
          <Button onClick={handleClose} className="w-96 mr-auto">
            Explore Prism
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// System Stats Component
function SystemStats() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['system-stats'],
    queryFn: async () => {
      const [servers, users, nodes] = await Promise.all([
        axios.get('/api/servers'),
        axios.get('/api/users'),
        axios.get('/api/nodes')
      ]);
      return {
        servers: servers.data.meta.pagination.total || 0,
        users: users.data.meta.pagination.total || 0,
        nodes: nodes.data.meta.pagination.total || 0
      };
    },
    refetchInterval: 60000
  });

  const statCards = [
    { icon: Server, label: 'Total Servers', value: stats?.servers || 0 },
    { icon: Users, label: 'Total Users', value: stats?.users || 0 },
    { icon: CircuitBoard, label: 'Active Nodes', value: stats?.nodes || 0 }
  ];

  return (
    <div className="grid grid-cols-3 gap-4">
      {statCards.map((stat, i) => (
        <Card key={i}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-neutral-900 rounded-lg">
                <stat.icon className="w-6 h-6 text-neutral-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-neutral-400">{stat.label}</p>
                <p className="text-2xl font-bold">
                  {isLoading ? (
                    <div className="h-8 w-16 bg-neutral-800 animate-pulse rounded" />
                  ) : (
                    stat.value.toLocaleString()
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// Backup Management Dialog
function BackupsDialog({ isOpen, onClose }) {
  const [selectedBackup, setSelectedBackup] = useState(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState('');
  const [showRebootPrompt, setShowRebootPrompt] = useState(false);

  const { data: backups, isLoading, refetch } = useQuery({
    queryKey: ['backups'],
    queryFn: async () => {
      const { data } = await axios.get('/api/config/backups');
      return data;
    },
    enabled: isOpen
  });

  const handleRestore = async () => {
    try {
      setIsRestoring(true);
      setError('');
      await axios.post(`/api/config/backups/${selectedBackup.name}/restore`);
      setShowRebootPrompt(true);
      refetch();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to restore backup');
    } finally {
      setIsRestoring(false);
    }
  };

  const handleReboot = async () => {
    try {
      await axios.post('/api/reboot');
      onClose();
      setTimeout(() => window.location.reload(), 7000);
    } catch (err) {
      setError('Failed to reboot dashboard');
    }
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  if (showRebootPrompt) {
    return (
      <AlertDialog open={true} onOpenChange={() => setShowRebootPrompt(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Configuration Restored</AlertDialogTitle>
            <AlertDialogDescription>
              The configuration has been restored. Would you like to reboot the dashboard now to apply the changes?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowRebootPrompt(false);
              onClose();
            }}>Later</AlertDialogCancel>
            <AlertDialogAction onClick={handleReboot}>Reboot Now</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Configuration Backups</DialogTitle>
          <DialogDescription>
            View and manage your dashboard configuration backups. You can restore to a previous version if needed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <ScrollArea className="h-[400px] rounded-md border border-neutral-800">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Filename</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={3}>
                      <div className="flex items-center justify-center py-4">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {backups?.map((backup) => (
                      <TableRow key={backup.name}>
                        <TableCell>{formatDate(backup.timestamp)}</TableCell>
                        <TableCell className="font-mono text-sm">{backup.name}</TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(`/api/config/backups/${backup.name}`, '_blank')}
                          >
                            <FileCode className="w-4 h-4 mr-2" />
                            View
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedBackup(backup)}
                          >
                            <RotateCcw className="w-4 h-4 mr-2" />
                            Restore
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!backups?.length && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-neutral-500">
                          No backups found
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>

        {selectedBackup && (
          <AlertDialog open={true} onOpenChange={() => setSelectedBackup(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Restore Configuration</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to restore the configuration from {formatDate(selectedBackup.timestamp)}? 
                  This will overwrite your current configuration and require a dashboard reboot.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setSelectedBackup(null)}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction onClick={handleRestore} disabled={isRestoring}>
                  {isRestoring ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Restoring...
                    </>
                  ) : (
                    'Restore Configuration'
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminOverview() {
  const [showWelcome, setShowWelcome] = useState(() => {
    return !localStorage.getItem('prismWelcomeShown');
  });
  const [configContent, setConfigContent] = useState('');
  const [isRebootDialogOpen, setIsRebootDialogOpen] = useState(false);
  const [isBackupsDialogOpen, setIsBackupsDialogOpen] = useState(false);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isRebooting, setIsRebooting] = useState(false);

  const { data: config, isLoading: loadingConfig } = useQuery({
    queryKey: ['config'],
    queryFn: async () => {
      const { data } = await axios.get('/api/config');
      return data;
    }
  });

  const { data: rebootStatus, isLoading: loadingReboot } = useQuery({
    queryKey: ['rebootStatus'],
    queryFn: async () => {
      const { data } = await axios.get('/api/reboot/status');
      return data;
    },
    refetchInterval: 5000
  });

  useEffect(() => {
    const fetchConfigContent = async () => {
      try {
        const { data } = await axios.get('/api/config/raw');
        setConfigContent(data);
      } catch (err) {
        setError('Failed to load configuration file');
      }
    };
    fetchConfigContent();
  }, []);

  const handleSaveConfig = async () => {
    try {
      setIsSaving(true);
      setError('');

      // Create backup before saving
      const timestamp = Date.now();
      const backupName = `config-${timestamp}.toml`;
      await axios.post('/api/config/raw', configContent, {
        headers: { 'Content-Type': 'text/plain' }
      });

      setError('Configuration saved successfully. A reboot is required to apply changes.');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReboot = async () => {
    try {
      setIsRebooting(true);
      setIsRebootDialogOpen(false);
      await axios.post('/api/reboot');
      setTimeout(() => window.location.reload(), 7000);
    } catch (err) {
        setError('Failed to initiate reboot');
        setIsRebooting(false);
      }
    };
  
    const handleCreateBackup = async () => {
      try {
        setError('');
        await handleSaveConfig();
        setIsBackupsDialogOpen(true);
      } catch (err) {
        setError('Failed to create backup');
      }
    };
  
    if (loadingConfig || loadingReboot) {
      return (
        <div className="p-6">
          <div className="h-8 w-32 bg-neutral-800 rounded animate-pulse mb-6" />
          <div className="grid gap-6">
            <div className="h-40 bg-neutral-800 rounded animate-pulse" />
            <div className="h-40 bg-neutral-800 rounded animate-pulse" />
          </div>
        </div>
      );
    }
  
    return (
      <div className="min-h-screen bg-neutral-950">
        <WelcomeModal 
          isOpen={showWelcome} 
          onClose={() => setShowWelcome(false)} 
        />
        
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold">Overview</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                onClick={handleCreateBackup}
              >
                <Archive className="w-4 h-4 mr-2" />
                Create Backup
              </Button>
              <Button 
                onClick={() => setIsRebootDialogOpen(true)}
                variant={rebootStatus?.needsReboot ? "default" : "outline"}
                disabled={isRebooting}
              >
                {isRebooting ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Rebooting...
                  </>
                ) : rebootStatus?.needsReboot ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Reboot Required
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Reboot Dashboard
                  </>
                )}
              </Button>
            </div>
          </div>
  
          {/* System Overview Section */}
          <div className="grid gap-6 mb-6">
            <Card>
              <CardHeader>
                <CardTitle>System Overview</CardTitle>
                <CardDescription>Current system status and statistics</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-1">
                  <div className="flex items-center text-sm">
                    <Badge variant="outline" className="mr-2">{config?.version}</Badge>
                    <ChevronRight className="w-4 h-4 text-neutral-500" />
                    <span className="text-neutral-400">Platform {config?.platform_level}</span>
                    <ChevronRight className="w-4 h-4 text-neutral-500" />
                    <span className="text-neutral-400">"{config?.platform_codename}"</span>
                  </div>
                </div>
                <SystemStats />
              </CardContent>
            </Card>
          </div>
  
          <div className="grid gap-6 grid-cols-4">
{/* Main Configuration Section */}
<div className="col-span-3">
  <Card className="flex flex-col h-[calc(100vh-20rem)]">
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <FileCode className="w-4 h-4" />
        Configuration Editor
      </CardTitle>
      <CardDescription>
        Edit your dashboard's configuration file directly. Be careful as incorrect changes may break your dashboard.
      </CardDescription>
    </CardHeader>
    <CardContent className="flex-1 pb-0">
      <div className="h-full">
        <textarea
          value={configContent}
          onChange={(e) => setConfigContent(e.target.value)}
          className="w-full h-full p-4 bg-neutral-950 font-mono text-sm resize-none focus:outline-none border border-neutral-800 rounded-md"
          spellCheck={false}
        />
      </div>
    </CardContent>
    <CardFooter className="flex justify-between mt-4">
      <div className="text-sm text-neutral-500">
        {rebootStatus?.needsReboot && (
          <span className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-yellow-500" />
            Reboot required to apply changes
          </span>
        )}
      </div>
      <Button onClick={handleSaveConfig} disabled={isSaving}>
        {isSaving ? (
          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Save className="w-4 h-4 mr-2" />
        )}
        Save Changes
      </Button>
    </CardFooter>
  </Card>
</div>
  
            {/* Quick Actions Section */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                  <CardDescription>Common administrative tasks</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Button 
                      variant="outline" 
                      className="w-full justify-start" 
                      onClick={() => setIsBackupsDialogOpen(true)}
                    >
                      <Archive className="w-4 h-4 mr-2" />
                      Config Backups
                    </Button>
                    <Button 
                      variant="outline" 
                      className="w-full justify-start hidden"
                      onClick={() => window.open('/api/config/backups', '_blank')}
                    >
                      <FileCode className="w-4 h-4 mr-2" />
                      View Backup Files
                    </Button>
                    <Button 
                      variant="outline" 
                      className="w-full justify-start hidden"
                      onClick={async () => {
                        try {
                          await axios.post('/api/panel/rebuild');
                          setError('Panel rebuild initiated successfully');
                        } catch (err) {
                          setError('Failed to rebuild panel');
                        }
                      }}
                    >
                      <Box className="w-4 h-4 mr-2" />
                      Rebuild Panel
                    </Button>
                  </div>
                </CardContent>
              </Card>
  
              {error && (
                <Alert variant={error.includes('successfully') ? "default" : "destructive"}>
                  {error.includes('successfully') ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <AlertCircle className="h-4 w-4" />
                  )}
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>
          </div>
        </div>
  
        <BackupsDialog 
          isOpen={isBackupsDialogOpen}
          onClose={() => setIsBackupsDialogOpen(false)}
        />
  
        <AlertDialog open={isRebootDialogOpen} onOpenChange={setIsRebootDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reboot Dashboard</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to reboot the dashboard? All active connections will be temporarily disconnected.
                {rebootStatus?.needsReboot && (
                  <Alert className="mt-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Configuration changes have been detected that require a reboot to take effect.
                    </AlertDescription>
                  </Alert>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setIsRebootDialogOpen(false)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleReboot} disabled={isRebooting}>
                {isRebooting ? 'Rebooting...' : 'Reboot Dashboard'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }