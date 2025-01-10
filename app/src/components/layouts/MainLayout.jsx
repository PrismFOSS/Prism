import { Link, useNavigate, useLocation, Outlet, useParams } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { 
  Terminal, 
  FolderClosed,
  ChevronLeft, 
  Blocks, 
  LayoutDashboard,
  PanelsTopLeft,
  SquareKanban,
  Users,
  Coins,
  Workflow,
  Menu,
  SendToBack,
  Globe,
  Network,
  MessageCircleQuestion,
  LogOut,
  Settings,
  User,
  Tags,
  ChevronDown,
  Archive,
  Cog,
  MoreHorizontal,
  Ticket,
  Power,
  RotateCw,
  Square,
  Server,
  Store,
  Coffee,
  ShieldBan
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import LoadingScreen from '../LoadingScreen';
import PageTransition from '../PageTransition';

export default function MainLayout() {
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [coinsBalance, setCoinsBalance] = useState(0);
  const [userData, setUserData] = useState({ username: '', id: '' });
  const [serverInfo, setServerInfo] = useState({
    name: '',
    status: 'offline',
    ip: '',
    port: ''
  });
  const [retryCount, setRetryCount] = useState(0);
  const RETRY_COUNT = 5;
  const RETRY_DELAY = 5000;
  
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const showSidebar = location.pathname.includes('/server/');
  const showAdminSidebar = location.pathname.includes('/admin/');
  const socketRef = useRef(null);
  const mounted = useRef(true);

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/user/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        navigate('/auth');
      } else {
        console.error('Logout failed:', await response.text());
      }
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleWebSocketMessage = (event) => {
    if (!mounted.current) return;

    try {
      const message = JSON.parse(event.data);

      switch (message.event) {
        case 'auth success':
          socketRef.current?.send(JSON.stringify({ event: 'send stats', args: [null] }));
          break;

        case 'status':
          setServerInfo(prev => ({
            ...prev,
            status: message.args[0]
          }));
          break;
      }
    } catch (error) {
      console.error('WebSocket message handling error:', error);
    }
  };

  useEffect(() => {
    mounted.current = true;

    const connectWebSocket = async () => {
      if (!id || !mounted.current) return;

      try {
        const response = await fetch(`/api/server/${id}/websocket`);
        const data = await response.json();
        const ws = new WebSocket(data.data.socket);

        ws.onopen = () => {
          if (!mounted.current) {
            ws.close();
            return;
          }

          console.log('WebSocket connected');
          setRetryCount(0);
          ws.send(JSON.stringify({
            event: "auth",
            args: [data.data.token]
          }));
        };

        ws.onmessage = handleWebSocketMessage;

        ws.onclose = () => {
          if (!mounted.current) return;

          console.log('WebSocket disconnected');
          if (retryCount < RETRY_COUNT) {
            setTimeout(() => {
              if (mounted.current) {
                setRetryCount(prev => prev + 1);
                connectWebSocket();
              }
            }, RETRY_DELAY);
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
        };

        socketRef.current = ws;
      } catch (error) {
        console.error('WebSocket connection error:', error);
      }
    };

    connectWebSocket();

    return () => {
      mounted.current = false;
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [id, retryCount]);

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const response = await fetch('/api/admin');
        const data = await response.json();
        setIsAdmin(data.admin === true);
      } catch (error) {
        console.error('Failed to check admin status:', error);
        setIsAdmin(false);
      }
    };

    // Call checkAdmin immediately and set up interval
    checkAdmin();
    const intervalId = setInterval(checkAdmin, 30000); // Check every 30 seconds

    const fetchUserData = async () => {
      try {
        const response = await fetch('/api/user');
        const data = await response.json();
        setUserData(data);
      } catch (error) {
        console.error('Failed to fetch user data:', error);
        setUserData({ username: 'User', id: '00000' });
      }
    };

    const fetchCoinsBalance = async () => {
      try {
        const response = await fetch('/api/coins');
        const data = await response.json();
        setCoinsBalance(data.coins);
      } catch (error) {
        console.error('Failed to fetch coins balance:', error);
        setCoinsBalance(0);
      }
    };

    setInterval(fetchCoinsBalance, 3000);

    const fetchServerInfo = async () => {
      if (id) {
        try {
          const response = await fetch(`/api/server/${id}`);
          const data = await response.json();
          setServerInfo({
            name: data.attributes.name,
            status: data.attributes.status,
            ip: data.attributes.relationships?.allocations?.data?.[0]?.attributes?.ip_alias,
            port: data.attributes.relationships?.allocations?.data?.[0]?.attributes?.port
          });
        } catch (error) {
          console.error('Failed to fetch server info:', error);
        }
      }
    };

    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1500);

    fetchUserData();
    fetchCoinsBalance();
    fetchServerInfo();

    return () => {
      clearTimeout(timer);
      clearInterval(intervalId);
    };
  }, [id]);

  const handlePowerAction = (action) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        event: "set state",
        args: [action]
      }));
    }
  };

  const getStatusBadgeVariant = (status) => {
    switch (status?.toLowerCase()) {
      case 'running':
        return 'success';
      case 'starting':
      case 'stopping':
        return 'warning';
      case 'offline':
      case 'stopped':
        return 'secondary';
      default:
        return 'secondary';
    }
  };

  const mainSidebarNavItems = [
    { 
      icon: <PanelsTopLeft className="w-4 h-4" />,
      label: 'Overview',
      path: `/server/${id}/overview`
    },
    { 
      icon: <Terminal className="w-4 h-4" />,
      label: 'Console',
      path: `/server/${id}/console`
    },
    { 
      icon: <FolderClosed className="w-4 h-4" />,
      label: 'Files',
      path: `/server/${id}/files`
    },
    { 
      icon: <Globe className="w-4 h-4" />,
      label: 'Network',
      path: `/server/${id}/network`
    },
    { 
      icon: <User className="w-4 h-4" />,
      label: 'Users',
      path: `/server/${id}/users`
    },
    {
      icon: <Archive className="w-4 h-4" />,
      label: 'Backups',
      path: `/server/${id}/backups`
    },
    {
      icon: <Cog className="w-4 h-4" />,
      label: 'Settings',
      path: `/server/${id}/settings`
    }
  ];

  const moreSidebarItems = [
    { 
      icon: <Blocks className="w-4 h-4" />,
      label: 'Plugins',
      path: `/server/${id}/plugins`
    },
    { 
      icon: <SendToBack className="w-4 h-4" />,
      label: 'Players',
      path: `/server/${id}/players`
    }
  ];

  const adminSidebarItems = [
    {
      icon: <SquareKanban className="w-4 h-4" />,
      label: 'Overview',
      path: '/admin/overview'
    },
    {
      icon: <Users className="w-4 h-4" />,
      label: 'Users',
      path: '/admin/users'
    },
    {
      icon: <Workflow className="w-4 h-4" />,
      label: 'Nodes',
      path: '/admin/nodes'
    },
    {
      icon: <ShieldBan className="w-4 h-4" />,
      label: 'Radar',
      path: '/admin/radar'
    },
    {
      icon: <Ticket className="w-4 h-4" />,
      label: 'Tickets',
      path: '/admin/tickets'
    }
  ];

  const isActivePath = (path) => {
    return location.pathname === path;
  };

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-screen bg-neutral-950">
      <style jsx global>{`
        * {
          --removed-focus-outline: none !important;
        }
      `}</style>
      
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 w-full border-b border-neutral-800 bg-neutral-900/95 backdrop-blur supports-[backdrop-filter]:bg-neutral-900/60">
        <div className="flex h-14 items-center px-4">
          <div className="flex items-center gap-4 mr-4">
            <Link 
              to="/dashboard"
              className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors"
            >
              <img 
                src="https://i.imgur.com/TinuetS.png" 
                alt="Logo" 
                className="w-6 h-6 ml-1.5"
              />
            </Link>
            <Separator orientation="vertical" className="h-6 bg-neutral-800" />
          </div>

          {/* Main Navigation */}
          <nav className={`flex items-center space-x-2`}>
            <Button
              variant={location.pathname === '/dashboard' ? "secondary" : "ghost"}
              size="sm"
              className={`${location.pathname === '/dashboard' ? "" : "text-neutral-400"} focus:ring-0 focus-visible:ring-0 pl-4 focus-visible:ring-offset-0`}
              asChild
            >
              <Link to="/dashboard" className="flex items-center gap-2">
                <LayoutDashboard className="w-4 h-4" />
                <span>Dashboard</span>
              </Link>
            </Button>

            <Button
              variant={location.pathname === '/account' ? "secondary" : "ghost"}
              size="sm"
              className={`${location.pathname === '/account' ? "" : "text-neutral-400"} focus:ring-0 focus-visible:ring-0 pl-4 focus-visible:ring-offset-0`}
              asChild
            >
              <Link to="/account" className="flex items-center gap-2">
                <User className="w-4 h-4" />
                <span>Account</span>
              </Link>
            </Button>
            
            <Button
              variant={location.pathname === '/referrals' ? "secondary" : "ghost"}
              size="sm"
              className={`${location.pathname === '/referrals' ? "" : "text-neutral-400"} focus:ring-0 focus-visible:ring-0 pl-4 focus-visible:ring-offset-0`}
              asChild
            >
              <Link to="/referrals" className="flex items-center gap-2">
                <Tags className="w-4 h-4" />
                <span>Referrals</span>
              </Link>
            </Button>

            <Button
              variant={location.pathname === '/tickets' ? "secondary" : "ghost"}
              size="sm"
              className={`${location.pathname === '/tickets' ? "" : "text-neutral-400"} focus:ring-0 focus-visible:ring-0 pl-4 focus-visible:ring-offset-0`}
              asChild
            >
              <Link to="/tickets" className="flex items-center gap-2">
                <MessageCircleQuestion className="w-4 h-4" />
                <span>Support</span>
              </Link>
            </Button>

            {isAdmin && (
              <Button
                variant={location.pathname.startsWith('/admin/') ? "secondary" : "ghost"}
                size="sm"
                className={`${location.pathname.startsWith('/admin/') ? "" : "text-neutral-400"} focus:ring-0 focus-visible:ring-0 pl-4 focus-visible:ring-offset-0`}
                asChild
              >
                <Link to="/admin/overview" className="flex items-center gap-2">
                  <Cog className="w-4 h-4" />
                  <span>Admin</span>
                </Link>
              </Button>
            )}
          </nav>

          {/* Right Section - Coins & User Menu */}
          <div className="flex items-center ml-auto gap-4">
{/* Coins Menu */}
<div className="relative group">
  <Button 
    variant="ghost" 
    size="sm" 
    className="flex items-center gap-2 text-neutral-400 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 group-hover:bg-neutral-800/50"
  >
    <Coins className="w-4 h-4" />
    <span className="text-sm">{coinsBalance.toFixed(2)} coins</span>
  </Button>
  
  {/* Sliding Menu */}
  <div className="absolute right-0 w-72 mt-1 invisible translate-y-4 opacity-0 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 ease-[cubic-bezier(0.26,1.05,0.7,1)]">
    <div className="bg-neutral-900 border border-neutral-800 rounded-md shadow-lg p-2">
      <Link 
        to="/coins/afk" 
        className="flex items-start gap-3 p-3 rounded-md hover:bg-neutral-800/50 transition-colors duration-200"
      >
        <div className="flex-shrink-0">
          <div className="w-10 h-10 rounded-lg bg-neutral-800/75 flex items-center justify-center">
            <Coffee className="w-5 h-5 text-neutral-400" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-neutral-200">AFK Page</p>
          <p className="text-xs text-neutral-400 mt-0.5">Earn coins while being AFK</p>
        </div>
      </Link>
      
      <Link 
        to="/coins/store" 
        className="flex items-start gap-3 p-3 mt-1 rounded-md hover:bg-neutral-800/50 transition-colors duration-200"
      >
        <div className="flex-shrink-0">
          <div className="w-10 h-10 rounded-lg bg-neutral-800/75 flex items-center justify-center">
            <Store className="w-5 h-5 text-neutral-400" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-neutral-200">Resources Store</p>
          <p className="text-xs text-neutral-400 mt-0.5">Buy resources with your coins</p>
        </div>
      </Link>
    </div>
  </div>
</div>
            <Separator orientation="vertical" className="h-6 bg-neutral-800" />
            
            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="flex items-center gap-2 text-neutral-400 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                >
                  <Avatar className="h-6 w-6">
                    <AvatarImage src="https://i.imgur.com/J4jb4zO.png" />
                    <AvatarFallback>U</AvatarFallback>
                  </Avatar>
                  <span className="hidden lg:inline">{userData.username}</span>
                  {isAdmin && (
                    <Badge variant="secondary" className="ml-1 text-xs bg-white/10 hover:bg-white/20">
                      Admin
                    </Badge>
                  )}
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent 
                align="end" 
                className="w-56 bg-neutral-900 border-neutral-800"
              >
                <DropdownMenuLabel className="text-neutral-400 text-xs font-mono">
                  User {userData.id}
                  </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-neutral-800" />
              <DropdownMenuItem 
               className="text-neutral-400 hover:text-white focus:text-white cursor-pointer focus:bg-neutral-800 hover:bg-neutral-800"
               onClick={() => window.location.href = '/account'}
             >
               <Settings className="mr-2 h-4 w-4" />
               <span>Settings</span>
             </DropdownMenuItem>

                <DropdownMenuItem 
                  className="cursor-pointer text-red-500 hover:text-red-400 focus:text-red-400 focus:bg-neutral-800 hover:bg-neutral-800" 
                  onClick={handleLogout}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Server Sidebar */}
        {showSidebar && (
          <aside className="w-64 min-h-[calc(100vh-3.5rem)] bg-neutral-900/20 border-r border-neutral-800/20">
            <div className="p-4">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-neutral-400 hover:text-white mb-4"
                onClick={() => navigate('/dashboard')}
              >
                <ChevronLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>

              {/* Server Info Card */}
              <Card className="p-4 mb-4 bg-neutral-900/40 border-neutral-800/40">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-neutral-400" />
                    <span className="font-medium text-sm text-white">{serverInfo.name}</span>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40 bg-neutral-900 border-neutral-800">
                      <DropdownMenuItem 
                        className="text-neutral-400 hover:text-white cursor-pointer"
                        onClick={() => handlePowerAction('start')}
                        disabled={['starting', 'running'].includes(serverInfo.status)}
                      >
                        <Power className="w-4 h-4 mr-2" />
                        Start
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        className="text-neutral-400 hover:text-white cursor-pointer"
                        onClick={() => handlePowerAction('restart')}
                        disabled={!['running'].includes(serverInfo.status)}
                      >
                        <RotateCw className="w-4 h-4 mr-2" />
                        Restart
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        className="text-neutral-400 hover:text-white cursor-pointer"
                        onClick={() => handlePowerAction('stop')}
                        disabled={!['running'].includes(serverInfo.status)}
                      >
                        <Square className="w-4 h-4 mr-2" />
                        Stop
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="space-y-1">
                  <Badge 
                    variant={getStatusBadgeVariant(serverInfo.status)} 
                    className="mb-2"
                  >
                    {serverInfo.status?.toUpperCase()}
                  </Badge>
                  <p className="text-xs text-neutral-400">
                    {serverInfo.ip}:{serverInfo.port}
                  </p>
                </div>
              </Card>

              {/* Main Navigation */}
              <div className="space-y-1">
                {mainSidebarNavItems.map((item) => (
                  <Button
                    key={item.label}
                    variant={isActivePath(item.path) ? "secondary" : "ghost"}
                    size="sm"
                    className={`w-full justify-start ${isActivePath(item.path) ? "" : "text-neutral-400"}`}
                    asChild
                  >
                    <Link to={item.path} className="flex items-center gap-2">
                      {item.icon}
                      <span>{item.label}</span>
                    </Link>
                  </Button>
                ))}
              </div>

              {/* More Section */}
              <div className="mt-4">
                <h3 className="text-xs font-medium text-neutral-500 mb-2 px-2">More</h3>
                <div className="space-y-1">
                  {moreSidebarItems.map((item) => (
                    <Button
                      key={item.label}
                      variant={isActivePath(item.path) ? "secondary" : "ghost"}
                      size="sm"
                      className={`w-full justify-start ${isActivePath(item.path) ? "" : "text-neutral-400"}`}
                      asChild
                    >
                      <Link to={item.path} className="flex items-center gap-2">
                        {item.icon}
                        <span>{item.label}</span>
                      </Link>
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        )}

        {/* Admin Sidebar */}
        {showAdminSidebar && (
          <aside className="w-64 min-h-[calc(100vh-3.5rem)] bg-neutral-900/20 border-r border-neutral-800/20">
            <div className="p-4">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-neutral-400 hover:text-white mb-4"
                onClick={() => navigate('/dashboard')}
              >
                <ChevronLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
              <nav className="space-y-2">
                {adminSidebarItems.map((item) => (
                  <Button
                    key={item.label}
                    variant={isActivePath(item.path) ? "secondary" : "ghost"}
                    size="sm"
                    className={`w-full justify-start ${isActivePath(item.path) ? "" : "text-neutral-400"}`}
                    asChild
                  >
                    <Link to={item.path} className="flex items-center gap-2">
                      {item.icon}
                      <span>{item.label}</span>
                    </Link>
                  </Button>
                ))}
              </nav>
            </div>
          </aside>
        )}

        {/* Main Content with Page Transitions */}
        <AnimatePresence mode="wait">
          <main className={`flex-1 ${showSidebar || showAdminSidebar ? 'max-w-[calc(100%-16rem)]' : 'max-w-7xl mx-auto'} px-4 sm:px-6 lg:px-8 py-6 text-white`}>
            <PageTransition key={location.pathname}>
              <Outlet />
            </PageTransition>
          </main>
        </AnimatePresence>
      </div>
    </div>
  );
}
