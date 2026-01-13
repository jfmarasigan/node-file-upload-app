import React, { useState } from 'react';
import NavBar from '@/components/NavBar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BarChart3, DatabaseIcon, Globe, Search, ServerIcon, Power, Copy } from 'lucide-react';
import { useApiEndpoints } from '@/contexts/ApiEndpointsContext';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const Dashboard = () => {
  const navigate = useNavigate();
  const { endpoints, deleteEndpoint, toggleEndpointStatus, duplicateEndpoint } = useApiEndpoints();
  const [searchQuery, setSearchQuery] = useState('');

  // Calculate KPI values
  const totalEndpoints = endpoints.length;
  const activeEndpoints = endpoints.filter(endpoint => endpoint.status === 'active').length;
  const inactiveEndpoints = totalEndpoints - activeEndpoints;

  // Filter endpoints based on search query
  const filteredEndpoints = endpoints.filter(endpoint => 
    endpoint.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    endpoint.sqlQuery.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDeleteEndpoint = (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete the endpoint "${name}"?`)) {
      deleteEndpoint(id);
      toast.success(`Endpoint "${name}" deleted successfully`);
    }
  };

  const handleToggleStatus = (id: string, name: string, currentStatus: string) => {
    toggleEndpointStatus(id);
    toast.success(`Endpoint "${name}" ${currentStatus === 'active' ? 'deactivated' : 'activated'} successfully`);
  };

  const handleDuplicateEndpoint = async (id: string, name: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      const success = await duplicateEndpoint(id);
      if (success) {
        toast.success(`Endpoint "${name}" duplicated successfully`);
      } else {
        toast.error(`Failed to duplicate endpoint "${name}"`);
      }
    } catch (error) {
      console.error('Error duplicating endpoint:', error);
      toast.error('An error occurred while duplicating the endpoint');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      
      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-medium flex items-center">
                <ServerIcon className="h-5 w-5 text-blue-500 mr-2" />
                API Endpoints
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{totalEndpoints}</p>
              <p className="text-sm text-gray-500">
                {activeEndpoints} active, {inactiveEndpoints} inactive
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-medium flex items-center">
                <DatabaseIcon className="h-5 w-5 text-blue-500 mr-2" />
                Active Connections
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{activeEndpoints}</p>
              <p className="text-sm text-gray-500">Current active connections</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-medium flex items-center">
                <BarChart3 className="h-5 w-5 text-blue-500 mr-2" />
                Total Requests
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">
                {endpoints.reduce((sum, endpoint) => sum + (endpoint.requestCount || 0), 0)}
              </p>
              <p className="text-sm text-gray-500">Across all endpoints</p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-blue-600">Your API Endpoints</h2>
            <Button 
              onClick={() => navigate('/create')}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Create New Endpoint
            </Button>
          </div>

          <div className="flex items-center space-x-2">
            <Search className="h-5 w-5 text-gray-400" />
            <Input
              placeholder="Search endpoints..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-sm"
            />
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>SQL Query</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEndpoints.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                      No endpoints found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEndpoints.map((endpoint) => (
                    <TableRow key={endpoint.id}>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span>{endpoint.name}</span>
                          <span className="text-sm text-gray-500">{endpoint.method} {endpoint.url}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleStatus(endpoint.id, endpoint.name, endpoint.status)}
                          className={`flex items-center gap-2 ${
                            endpoint.status === 'active'
                              ? 'text-green-600 hover:text-green-700 hover:bg-green-50'
                              : 'text-gray-600 hover:text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <Power className={`h-4 w-4 ${
                            endpoint.status === 'active' ? 'text-green-500' : 'text-gray-400'
                          }`} />
                          {endpoint.status === 'active' ? 'Active' : 'Inactive'}
                        </Button>
                      </TableCell>
                      <TableCell className="max-w-md">
                        <code className="text-sm text-gray-600 truncate block">
                          {endpoint.sqlQuery}
                        </code>
                      </TableCell>
                      <TableCell>
                        {endpoint.lastUsed
                          ? new Date(endpoint.lastUsed).toLocaleString()
                          : 'Never'
                        }
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/create?test=${endpoint.id}`)}
                          >
                            Test
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => handleDuplicateEndpoint(endpoint.id, endpoint.name, e)}
                          >
                            <Copy className="mr-1 h-4 w-4" />
                            Clone
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/create?edit=${endpoint.id}`)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteEndpoint(endpoint.id, endpoint.name)}
                            className="text-red-600 hover:text-red-700"
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
