import React, { useEffect } from 'react';
import NavBar from '@/components/NavBar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { settingsService } from '@/services/settingsService';

const settingsSchema = z.object({
  apiLimits: z.boolean(),
  caching: z.boolean(),
  logging: z.boolean(),
  timeout: z.string().min(1),
});

type SettingsValues = z.infer<typeof settingsSchema>;

const Settings = () => {
  // Get current settings with all required fields
  const currentSettings = settingsService.getSettings();

  const form = useForm<SettingsValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      apiLimits: currentSettings.apiLimits,
      caching: currentSettings.caching,
      logging: currentSettings.logging,
      timeout: currentSettings.timeout,
    },
  });

  const onSubmit = (data: SettingsValues) => {
    // Create a settings object with all required fields
    const newSettings = {
      apiLimits: data.apiLimits,
      caching: data.caching,
      logging: data.logging,
      timeout: data.timeout,
    };
    settingsService.updateSettings(newSettings);
    toast.success('Settings saved successfully');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      
      <main className="container mx-auto px-4 py-6">
        <h1 className="text-3xl font-bold text-blue-700 mb-2">Settings</h1>
        <p className="text-gray-600 mb-6">
          Configure your API Builder preferences and defaults
        </p>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl font-bold text-blue-600">API Settings</CardTitle>
                <CardDescription>
                  Configure default behaviors for all API endpoints
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormField
                      control={form.control}
                      name="apiLimits"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base font-medium">Rate Limiting</FormLabel>
                            <FormDescription>
                              Enable rate limiting for all API endpoints (100 requests per minute)
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="caching"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base font-medium">Result Caching</FormLabel>
                            <FormDescription>
                              Cache API responses for 5 minutes to improve performance
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="logging"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base font-medium">Request Logging</FormLabel>
                            <FormDescription>
                              Log all API requests for debugging and monitoring
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="timeout"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Query Timeout (seconds)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number"
                              min="1" 
                              max="300" 
                              {...field} 
                              className="max-w-[100px]"
                            />
                          </FormControl>
                          <FormDescription>
                            Maximum time to wait for database query execution
                          </FormDescription>
                        </FormItem>
                      )}
                    />
                    
                    <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                      Save Settings
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </div>
          
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="text-xl font-bold text-blue-600">Account</CardTitle>
                <CardDescription>
                  Manage your account details
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="email">Email Address</Label>
                    <Input id="email" value="user@example.com" readOnly className="bg-gray-50" />
                  </div>
                  
                  <div>
                    <Label htmlFor="plan">Current Plan</Label>
                    <div className="flex items-center mt-1">
                      <span className="font-medium text-blue-600">Professional</span>
                      <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full">
                        Active
                      </span>
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div className="pt-2">
                    <Button variant="outline" className="w-full">
                      Manage Subscription
                    </Button>
                  </div>
                  
                  <div>
                    <Button variant="outline" className="w-full text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700">
                      Sign Out
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Settings;
