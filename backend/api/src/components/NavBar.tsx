
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { DatabaseIcon, HomeIcon, PlusIcon, SettingsIcon } from 'lucide-react';

const NavBar = () => {
  const location = useLocation();
  
  const isActive = (path: string) => {
    return location.pathname === path;
  };
  
  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1">
            <DatabaseIcon className="h-6 w-6 text-blue-600" />
            <span className="font-bold text-xl text-blue-600">GENIISYS API</span>
            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-medium ml-1">
              Builder
            </span>
          </div>
          
          <nav className="hidden md:flex space-x-1">
            <Button
              variant={isActive('/') ? 'default' : 'ghost'}
              size="sm"
              asChild
              className={isActive('/') ? 'bg-blue-100 text-blue-800 hover:bg-blue-200 hover:text-blue-900' : ''}
            >
              <Link to="/">
                <HomeIcon className="h-4 w-4 mr-1" />
                Dashboard
              </Link>
            </Button>
            
            <Button
              variant={isActive('/create') ? 'default' : 'ghost'}
              size="sm"
              asChild
              className={isActive('/create') ? 'bg-blue-100 text-blue-800 hover:bg-blue-200 hover:text-blue-900' : ''}
            >
              <Link to="/create">
                <PlusIcon className="h-4 w-4 mr-1" />
                Create Endpoint
              </Link>
            </Button>
            
            <Button
              variant={isActive('/settings') ? 'default' : 'ghost'}
              size="sm"
              asChild
              className={isActive('/settings') ? 'bg-blue-100 text-blue-800 hover:bg-blue-200 hover:text-blue-900' : ''}
            >
              <Link to="/settings">
                <SettingsIcon className="h-4 w-4 mr-1" />
                Settings
              </Link>
            </Button>
          </nav>
          
          <div className="md:hidden">
            {/* Mobile menu button would go here */}
            <Button variant="ghost" size="sm">
              <span className="sr-only">Open menu</span>
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default NavBar;
