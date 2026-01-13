import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, CheckCircle, X } from 'lucide-react';
import { useApiEndpoints } from '@/contexts/ApiEndpointsContext';
import { useSearchParams } from 'react-router-dom';
import { oracleApiService, QueryResult } from '@/services/oracleApiService';
import { Input } from '@/components/ui/input';
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from '@/components/ui/form';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { settingsService } from '@/services/settingsService';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

// Helper to extract path parameter names from URL pattern
const extractPathParams = (urlPattern?: string): string[] => {
  if (!urlPattern) return [];
  const paramRegex = /\{(\w+)\}/g;
  const matches = [...urlPattern.matchAll(paramRegex)];
  return matches.map(match => match[1]);
};

// Client-side helper to extract :input and @output params from SQL
const extractSqlParamsClient = (sql?: string, pathParams: string[] = []): { inputs: string[], outputs: string[] } => {
  if (!sql) return { inputs: [], outputs: [] };
  
  const inputRegex = /:(\w+)/g;  // Only match :param format
  const outputRegex = /@([\w_]+)/g;
  
  console.log("Processing SQL:", sql);
  
  const inputs = [...new Set([...sql.matchAll(inputRegex)].map(match => match[1]))];
  const outputs = [...new Set([...sql.matchAll(outputRegex)].map(match => match[1]))];
  
  console.log("Raw inputs found:", inputs);
  console.log("Outputs found:", outputs);
  
  // Filter out parameters that are already defined as path parameters
  const finalInputs = inputs.filter(inputName => {
    const isOutput = outputs.includes(inputName);
    const isPathParam = pathParams.includes(inputName);
    console.log(`Parameter "${inputName}":`, {
      isOutput,
      isPathParam,
      willBeIncluded: !isOutput && !isPathParam
    });
    return !isOutput && !isPathParam;
  });

  console.log("Final filtered inputs:", finalInputs);
  
  const returnValue = { inputs: finalInputs, outputs };
  console.log("Extracted query params:", returnValue);
  return returnValue;
};

const ApiResultPreview = () => {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [parameters, setParameters] = useState<Record<string, string>>({});
  const [payload, setPayload] = useState<string>('');
  const [payloadError, setPayloadError] = useState<string | null>(null);
  const [pathParamValues, setPathParamValues] = useState<Record<string, string>>({});
  const [token, setToken] = useState<string>('');

  const testEndpointId = searchParams.get('test');
  const editEndpointId = searchParams.get('edit');
  const { endpoints, getEndpoint } = useApiEndpoints();

  // Get the endpoint being tested or edited
  const endpoint = testEndpointId
    ? getEndpoint(testEndpointId)
    : editEndpointId
      ? getEndpoint(editEndpointId)
      : null;

  // Extract different parameter types using client-side helpers
  const pathParamNames = useMemo(() => extractPathParams(endpoint?.url), [endpoint?.url]);
  const queryParamNames = useMemo(
    () => {
      // Get params from SQL
      const sqlParams = extractSqlParamsClient(
        endpoint?.sqlQuery || endpoint?.sqlProcedure, 
        pathParamNames
      ).inputs;
      
      // Get params from endpoint definition
      const definedParams = endpoint?.queryParams?.map(p => p.name) || [];
      
      // Combine both sources and remove duplicates
      const combined = [...new Set([...sqlParams, ...definedParams])];
      console.log("Combined query params:", {
        fromSQL: sqlParams,
        fromDefinition: definedParams,
        final: combined
      });
      return combined;
    },
    [endpoint?.sqlQuery, endpoint?.sqlProcedure, endpoint?.queryParams, pathParamNames]
  );
  const procedureInputParamNames = useMemo(() => extractSqlParamsClient(endpoint?.sqlProcedure).inputs, [endpoint?.sqlProcedure]);
  const procedureOutputParamNames = useMemo(() => extractSqlParamsClient(endpoint?.sqlProcedure).outputs, [endpoint?.sqlProcedure]);

  // Determine parameter needs for UI rendering
  const isProcedureWithPayload = endpoint?.method !== 'GET' && !!endpoint?.sqlProcedure;
  const needsPathParams = pathParamNames.length > 0;
  const needsQueryParams = queryParamNames.length > 0;
  const needsProcedureParams = isProcedureWithPayload && procedureInputParamNames.length > 0;

  // Create a dynamic form schema based on the parameters in the SQL query
  const createFormSchema = (paramNames: string[]) => {
    const schemaObj: Record<string, z.ZodString | z.ZodOptional<z.ZodString>> = {};
    if (needsQueryParams) {
      paramNames.forEach(param => {
        const config = endpoint?.queryParams?.find(p => p.name === param);
        const isRequired = config?.required ?? false;
        schemaObj[param] = isRequired 
          ? z.string().min(1, `Parameter ${param} is required`)
          : z.string().optional();
      });
    }
    return z.object(schemaObj);
  };
  
  const formSchema = createFormSchema(queryParamNames);
  type FormValues = z.infer<typeof formSchema>;
  
  // Initialize default values for the form
  const getDefaultValues = (): Partial<FormValues> => {
    const defaults: Record<string, string> = {};
    if (needsQueryParams) {
        queryParamNames.forEach(param => { defaults[param] = ''; });
    }
    return defaults;
  };
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: getDefaultValues(),
    mode: 'onChange', // Validate on change
  });

  // Reset form and results when endpoint changes
  useEffect(() => {
    setResults(null);
    setError(null);
    setPayloadError(null);
    setPayload(''); // Clear payload on endpoint change
    setCurrentPage(1);
    setPathParamValues({}); // Clear path param values
    // Reset form values when endpoint changes
    if (endpoint) {
      form.reset(getDefaultValues());
    }
  }, [endpoint?.id]); // Removed form dependency to avoid loops

  // Handle path parameter input changes
  const handlePathParamChange = (paramName: string, value: string) => {
    setPathParamValues(prev => ({ ...prev, [paramName]: value }));
  };

  const handleTestApi = async (data: FormValues = {}) => {
    console.log("handleTestApi function triggered."); 

    const currentEndpointId = testEndpointId || editEndpointId;
    if (!currentEndpointId) {
      console.error("handleTestApi return: Cannot determine endpoint ID.");
      setError("Cannot determine the endpoint to test.");
      return;
    }

    // Add token to request params if required
    if (endpoint?.requireToken) {
      if (!token) {
        toast.error("Bearer token is required");
        return;
      }
      // Ensure token has "Bearer " prefix
      const tokenValue = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
      oracleApiService.setAuthToken(tokenValue);
    }

    const currentEndpoint = getEndpoint(currentEndpointId);
    console.log("[handleTestApi] Fetched currentEndpoint:", currentEndpoint); // Log fetched endpoint

    if (!currentEndpoint) {
      console.error("handleTestApi return: Endpoint not found in context."); // Log exit reason
      setError("Endpoint not found in context. Please save or select again.");
      return;
    }
    
    // Log the endpoint data fetched *inside* the handler
    console.log("handleTestApi using endpoint data fetched NOW:", {
        id: currentEndpoint.id,
        name: currentEndpoint.name,
        method: currentEndpoint.method,
        url: currentEndpoint.url,
        sqlQuery: currentEndpoint.sqlQuery,
        sqlProcedure: currentEndpoint.sqlProcedure,
    });
    
    // **1. Validate Path Parameters (Only Required Ones)**
    const pathParamConfigs = currentEndpoint.pathParams || [];
    console.log("[Validation] Path Param Configs:", pathParamConfigs);
    console.log("[Validation] Current Path Param Values State:", pathParamValues);

    const requiredPathParams = pathParamConfigs.filter(p => p.required);
    console.log("[Validation] Filtered Required Configs:", requiredPathParams);

    // Check if any required param is missing or empty in the state
    const missingRequiredValues = requiredPathParams.filter(p => {
        const value = pathParamValues[p.name];
        const isMissing = !value || value.trim() === '';
        console.log(`[Validation] Checking required param "${p.name}": Value="${value}", IsMissing=${isMissing}`);
        return isMissing;
    });
    console.log("[Validation] Params found missing:", missingRequiredValues);

    if (missingRequiredValues.length > 0) {
        const missingNames = missingRequiredValues.map(p => p.name).join(', ');
        console.error(`handleTestApi return: Missing required path params: ${missingNames}`); // Log exit reason
        toast.error(`Missing required path parameter values: ${missingNames}`);
        return;
    }

    // **2. Construct Final URL with Path Parameter Substitution**
    let finalUrl = currentEndpoint.url;

    // Keep track of params actually substituted to avoid double slashes
    const substitutedParams = new Set<string>(); 

    pathParamNames.forEach(p => {
        const config = pathParamConfigs.find(cfg => cfg.name === p);
        const isRequired = config?.required ?? false;
        const value = pathParamValues[p];
        const valueIsEmpty = !value || value.trim() === '';

        if (!isRequired && valueIsEmpty) {
            // Optional and Empty: Remove the /{param} segment
            // Need to be careful about slashes
            const optionalSegmentRegex = new RegExp(`\/{${p}}(\/?|$)`); // Matches /{param} followed by / or end of string
            if (finalUrl.match(optionalSegmentRegex)) {
                 console.log(`Removing optional empty segment for {${p}}`);
                 finalUrl = finalUrl.replace(optionalSegmentRegex, '$1'); // Replace with the slash/end captured after
            } else {
                 // Fallback: Just remove the placeholder if regex fails (e.g., param at start? unlikely)
                 finalUrl = finalUrl.replace(`{${p}}`, '');
            }
            // Clean up potential double slashes resulting from removal
            finalUrl = finalUrl.replace(/\/\//g, '/');
        } else {
            // Required OR Optional but has Value: Substitute value
            if (valueIsEmpty && isRequired) {
                 // This case should have been caught by validation, but log error just in case
                 console.error(`Required path parameter {${p}} is empty during URL substitution!`);
                 // Proceeding with empty string substitution, but request will likely fail validation server-side
                 finalUrl = finalUrl.replace(`{${p}}`, '');
            } else {
                 finalUrl = finalUrl.replace(`{${p}}`, encodeURIComponent(value!));
            }
            substitutedParams.add(p);
        }
    });
    
    // Ensure URL doesn't end with a trailing slash if it wasn't the very end of the original pattern
    // unless the original pattern explicitly ended with one.
    if (!currentEndpoint.url.endsWith('/') && finalUrl.endsWith('/') && finalUrl.length > 1) {
        finalUrl = finalUrl.slice(0, -1);
    }
    
    console.log(`Constructed URL for request: ${finalUrl}`);

    // **3. Validate Query Parameters (Only Required Ones)**
    if (needsQueryParams && !isProcedureWithPayload) {
      const queryParamConfigs = currentEndpoint.queryParams || [];
      const requiredQueryParams = queryParamConfigs.filter(p => p.required);
      
      const missingQueryParams = requiredQueryParams.filter(p => {
        const value = data[p.name];
        return !value || value.trim() === '';
      });

      if (missingQueryParams.length > 0) {
        const missingNames = missingQueryParams.map(p => p.name).join(', ');
        toast.error(`Missing required query parameters: ${missingNames}`);
        return;
      }
    }

    // **4. Prepare request parameters** (Payload or Query Params + Path Params)
    const isProcedureWithPayloadNow = currentEndpoint.method !== 'GET' && !!currentEndpoint.sqlProcedure && !needsQueryParams;
    let requestParams: Record<string, any> = {};

    if (isProcedureWithPayloadNow) {
        if (!payload) { 
            console.error("handleTestApi return: Payload required but missing.");
            toast.error("JSON payload is required..."); 
            return; 
        }
        if (payloadError) { 
            console.error("handleTestApi return: Payload has errors.");
            toast.error("Please fix JSON payload errors..."); 
            return; 
        }
        try {
            requestParams = JSON.parse(payload);
        } catch (e) {
            setError(`Invalid JSON payload: ${e instanceof Error ? e.message : 'Unknown JSON error'}`);
            setLoading(false);
            return;
        }
    } else {
        // Always use form data and path params when we have query parameters
        requestParams = { ...data, ...pathParamValues };
    }

    // --- If it reaches here, it should proceed --- 
    console.log("Proceeding to setLoading(true) and API call...");
    setLoading(true);
    setError(null);
    setResults(null);
    
    try {
      console.log("Executing with params object:", requestParams); 
      console.log(`Targeting substituted URL: ${finalUrl}`);

      const requestKey = `${currentEndpoint.id}_${finalUrl}_${JSON.stringify(requestParams)}`; // Include finalUrl in key?
      
      // Create a temporary endpoint object with the substituted URL for the service
      const endpointForExecution = { ...currentEndpoint, url: finalUrl };

      const result = await settingsService.handleRequest(
        requestKey,
        // Pass the modified endpoint with substituted URL
        () => oracleApiService.executeQuery(endpointForExecution, requestParams) 
      );
      
      if (result.success) {
        setResults(result);
        setCurrentPage(1); // Reset to first page when new results come in
      } else {
        // Handle validation errors
        if (result.errors && Array.isArray(result.errors)) {
          const errorMessage = result.errors.join('\n');
          setError(errorMessage);
          toast.error(errorMessage);
        } else {
          setError(result.error || "Unknown error occurred");
          toast.error(result.error || "API request failed");
        }
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to test endpoint");
       toast.error(error instanceof Error ? error.message : "Failed to test endpoint");
    } finally {
      setLoading(false);
    }
  };

  // Calculate pagination
  const totalPages = results?.data ? Math.ceil(results.data.length / itemsPerPage) : 0;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentData = results?.data?.slice(startIndex, endIndex) || [];

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
      if (
        i === 1 || // First page
        i === totalPages || // Last page
        (i >= currentPage - 1 && i <= currentPage + 1) // Pages around current page
      ) {
        pages.push(i);
      } else if (i === currentPage - 2 || i === currentPage + 2) {
        pages.push('...');
      }
    }
    return pages;
  };

  // Determine which parameters to show inputs for (only for non-payload cases)
  const showParameterInputs = !isProcedureWithPayload && queryParamNames.length > 0;

  if (!endpoint) {
    return (
      <Card className="border-blue-200">
        <CardHeader className="bg-blue-50 rounded-t-lg">
          <CardTitle className="text-xl font-bold text-blue-700">Test Your API</CardTitle>
          <CardDescription>
            No endpoint selected. Create or select an endpoint to test.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4 text-center">
          <p className="text-gray-500 mb-4">
            Create a new endpoint or select an existing one from the dashboard to test it.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-blue-200">
      <CardHeader className="bg-blue-50 rounded-t-lg">
        <CardTitle className="text-xl font-bold text-blue-700">Test Your API</CardTitle>
        <CardDescription>
          Testing endpoint: <span className="font-medium">{endpoint.name}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleTestApi)} className="space-y-6">
            
            {/* Add Token Input Section */}
            {endpoint?.requireToken && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold">Authentication</h3>
                </div>
                <div className="p-3 border rounded-lg bg-slate-50">
                  <Label htmlFor="token">Bearer Token</Label>
                  <Input
                    id="token"
                    type="text"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Enter your authentication token"
                    required={true}
                    className="mt-1 bg-amber-50"
                  />
                </div>
              </div>
            )}

            {/* Path Parameters Section */}
            {needsPathParams && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold">Path Parameters</h3>
                  <span className="text-sm text-muted-foreground">
                    (Used in URL: {endpoint.url})
                  </span>
                </div>
                <div className="grid grid-cols-[100px_1fr] gap-x-4 gap-y-2 p-3 border rounded-lg bg-slate-50">
                  {pathParamNames.map(param => {
                    const config = endpoint.pathParams?.find(p => p.name === param);
                    const isRequired = config?.required ?? false;

                    return (
                      <React.Fragment key={param}>
                        <div className="flex items-center">
                          <Label htmlFor={`path-${param}`} className="text-sm">
                            {param}
                          </Label>
                        </div>
                        <Input 
                          id={`path-${param}`}
                          value={pathParamValues[param] || ''}
                          onChange={(e) => handlePathParamChange(param, e.target.value)}
                          placeholder={`Enter ${param}`}
                          required={isRequired}
                          className={`h-8 ${isRequired ? 'bg-amber-50' : ''}`}
                        />
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Query Parameters Section */}
            {needsQueryParams && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold">Query Parameters</h3>
                  <span className="text-sm text-muted-foreground">
                    (Sent as URL parameters)
                  </span>
                </div>
                <div className="grid grid-cols-[100px_1fr] gap-x-4 gap-y-2 p-3 border rounded-lg bg-slate-50">
                  {queryParamNames.map(param => {
                    const config = endpoint.queryParams?.find(p => p.name === param);
                    const isRequired = config?.required ?? false;

                    return (
                      <FormField
                        key={param}
                        control={form.control}
                        name={param}
                        render={({ field }) => (
                          <React.Fragment>
                            <FormLabel className="text-sm text-foreground">
                              {param}
                            </FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                placeholder={`Enter ${param}`} 
                                className={`h-8 ${isRequired ? 'bg-amber-50' : ''}`}
                                required={isRequired}
                              />
                            </FormControl>
                          </React.Fragment>
                        )}
                      />
                    );
                  })}
                </div>
              </div>
            )}
            
            {/* Payload Section */}
            {isProcedureWithPayload && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold">Request Payload</h3>
                  <span className="text-sm text-muted-foreground">
                    (JSON body parameters)
                  </span>
                </div>
                <div className="p-4 border rounded-lg bg-slate-50">
                  <Textarea
                    id="payload"
                    placeholder='Enter JSON payload, e.g., {"id": 1, "name": "Test"}'
                    value={payload}
                    onChange={(e) => setPayload(e.target.value)}
                    className="min-h-[100px] font-mono mt-2"
                    aria-invalid={!!payloadError}
                  />
                  {payloadError && (
                    <p className="text-sm font-medium text-destructive mt-2">{payloadError}</p>
                  )}
                </div>
              </div>
            )}
            
            <Button 
              type="submit" 
              disabled={loading || (isProcedureWithPayload && !!payloadError)}
              className="mt-6"
            >
              {loading ? 'Testing...' : 'Test Endpoint'}
            </Button>
          </form>
        </Form>
        
        {loading && (
          <div className="p-8 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent align-[-0.125em]" role="status">
              <span className="sr-only">Loading...</span>
            </div>
            <p className="mt-2 text-blue-600">Connecting to Oracle database...</p>
          </div>
        )}
        
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4 mt-4">
            <div className="flex">
              <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
              <div>
                <h3 className="text-red-800 font-medium">Error testing API endpoint</h3>
                <p className="text-red-700 text-sm mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}
        
        {results && !error && (
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span className="text-green-700 font-medium">
                Success! Query executed in {results.execution_time}
              </span>
            </div>
            
            <Tabs defaultValue="results" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="results">Results</TabsTrigger>
                <TabsTrigger value="raw">Raw JSON</TabsTrigger>
                <TabsTrigger value="code">Code Example</TabsTrigger>
              </TabsList>
              
              <TabsContent value="results" className="p-0 mt-4">
                {results.data && results.data.length > 0 ? (
                  <div className="space-y-4">
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {Object.keys(results.data[0]).map(key => (
                              <TableHead key={key}>{key}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {currentData.map((row, i) => (
                            <TableRow key={i}>
                              {Object.values(row).map((value: any, j) => (
                                <TableCell key={j}>{value?.toString() || ''}</TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {totalPages > 1 && (
                      <div className="flex justify-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => currentPage > 1 && setCurrentPage(p => p - 1)}
                          disabled={currentPage === 1}
                        >
                          Previous
                        </Button>
                        
                        {getPageNumbers().map((page, index) => (
                          page === '...' ? (
                            <span key={index} className="px-2">...</span>
                          ) : (
                            <Button
                              key={index}
                              variant={currentPage === page ? "default" : "outline"}
                              size="sm"
                              onClick={() => setCurrentPage(Number(page))}
                            >
                              {page}
                            </Button>
                          )
                        ))}

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => currentPage < totalPages && setCurrentPage(p => p + 1)}
                          disabled={currentPage === totalPages}
                        >
                          Next
                        </Button>
                      </div>
                    )}

                    <div className="text-sm text-gray-500">
                      Showing {startIndex + 1} to {Math.min(endIndex, results.data.length)} of {results.data.length} results
                    </div>
                  </div>
                ) : (
                  <div className="text-center p-4 bg-gray-50 rounded-md">
                    <p className="text-gray-500">No results to display</p>
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="raw" className="mt-4">
                <div className="bg-gray-900 text-gray-100 p-4 rounded-md overflow-auto max-h-80">
                  <pre className="text-sm font-mono">
                    {JSON.stringify(results, null, 2)}
                  </pre>
                </div>
              </TabsContent>
              
              <TabsContent value="code" className="mt-4">
                <div className="bg-gray-900 text-gray-100 p-4 rounded-md overflow-auto">
                  <pre className="text-sm font-mono">
{`// JavaScript fetch example
fetch('${endpoint.url}${queryParamNames.length > 0 
  ? '?' + queryParamNames.map(p => `${p}=${form.getValues()[p] || ''}`).join('&') 
  : ''}')
  .then(response => response.json())
  .then(data => {
    console.log(data);
  })
  .catch(error => {
    console.error('Error:', error);
  });

// Axios example
import axios from 'axios';

axios.get('https://api.example.com${endpoint.url}', {
  params: {${queryParamNames.map(p => `
    ${p}: '${form.getValues()[p] || ''}'`).join(',')}
  }
})
  .then(response => {
    console.log(response.data);
  })
  .catch(error => {
    console.error('Error:', error);
  });

// Python requests example
import requests

response = requests.get(
    'https://api.example.com${endpoint.url}',
    params={${queryParamNames.map(p => `
        '${p}': '${form.getValues()[p] || ''}'`).join(',')}
    }
)
data = response.json()
print(data)`}
                  </pre>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ApiResultPreview;
