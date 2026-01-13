import React, { useState, useEffect } from 'react';
import { z } from 'zod';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { toast } from 'sonner';
import { Separator } from '@/components/ui/separator';
import { Copy, CheckCircle2, Info } from 'lucide-react';
import { useApiEndpoints, ApiEndpoint, PathParameterConfig, QueryParameterConfig } from '@/contexts/ApiEndpointsContext';
import { useNavigate } from 'react-router-dom';
import { oracleApiService } from '@/services/oracleApiService';
import { Label } from '@/components/ui/label';
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Define schema for string constraints
const stringConstraintsSchema = z.object({
  maxLength: z.number().int().positive().optional(),
  allowedValues: z.string().optional() // Store as comma-separated string
}).optional();

const numberConstraintsSchema = z.object({
  precision: z.number().int().min(0).max(10),
  minimum: z.number().optional(),
  maximum: z.number().optional()
}).superRefine((data, ctx) => {
  if (data.minimum !== undefined && data.maximum !== undefined) {
    if (data.maximum < data.minimum) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Max value must be greater than or equal to min value",
        path: ["maximum"]
      });
    }
  } else if ((data.minimum !== undefined && data.maximum === undefined) ||
    (data.maximum !== undefined && data.minimum === undefined)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Both min and max values must be provided if one is specified",
      path: [data.minimum === undefined ? "minimum" : "maximum"]
    });
  }
}).optional();

const dateConstraintsSchema = z.object({
  dateFormat: z.string().min(1, "Date format is required"),
}).optional();

// Define schema for path and query parameters within the form
const parameterSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(['string', 'number', 'date', 'object', 'array']).default('string'),
  required: z.boolean().default(true),
  stringConstraints: stringConstraintsSchema,
  numberConstraints: numberConstraintsSchema,
  dateConstraints: dateConstraintsSchema,
});

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  method: z.string().min(1, "Method is required"),
  url: z.string().min(1, "URL is required"),
  pathParams: z.array(parameterSchema).optional(),
  queryParams: z.array(parameterSchema).default([]),
  payloadParams: z.array(parameterSchema).default([]),
  sqlQuery: z.string().optional(),
  sqlProcedure: z.string().optional(),
  status: z.enum(["active", "inactive"]).default("active"),
  requireToken: z.boolean().default(false),
}).refine(data => {
  // Require sqlQuery if method is GET
  if (data.method === 'GET' && !data.sqlQuery) {
    return false;
  }
  return true;
}, {
  message: "SQL Query is required",
  path: ["sqlQuery"],
});

type FormValues = z.infer<typeof formSchema>;

// Type guard to check if an object conforms to PathParameterConfig or QueryParameterConfig
function isParameterConfig(obj: any): obj is PathParameterConfig | QueryParameterConfig {
  return obj && 
         typeof obj.name === 'string' && 
         obj.name !== '' && 
         typeof obj.type === 'string' && 
         ['string', 'number', 'date'].includes(obj.type) &&
         typeof obj.required === 'boolean';
}

// Helper to extract path parameter names from URL pattern
const extractPathParamsFromUrl = (urlPattern?: string): string[] => {
  if (!urlPattern) return [];
  const paramRegex = /\{(\w+)\}/g;
  const matches = [...urlPattern.matchAll(paramRegex)];
  return matches.map(match => match[1]);
};

// Helper to extract query parameters from SQL
const extractQueryParams = (sql?: string): string[] => {
  if (!sql) return [];
  const paramRegex = /:([a-zA-Z]\w*)/g;  // Match only :param format
  const matches = sql.match(paramRegex) || [];
  const params = matches.map(match => match.substring(1));
  console.log('Extracted query parameters:', params);
  return [...new Set(params)];
};

// Helper to determine if a path parameter is structurally required
const isStructurallyRequired = (url: string, paramName: string): boolean => {
  if (!url || !paramName) return false;
  
  const placeholder = `{${paramName}}`;
  const index = url.indexOf(placeholder);
  
  if (index === -1) return false; // Param not found in URL
  
  const afterParam = url.substring(index + placeholder.length);
  
  // If anything other than an optional single trailing slash exists after it, it's required.
  return afterParam.replace(/^\/?$/, '').length > 0;
};

const API_PREFIX = '/api/';

const stripApiPrefix = (url: string): string => {
  return url.startsWith(API_PREFIX) ? url.substring(API_PREFIX.length) : url;
};

const ensureApiPrefix = (url: string): string => {
  if (!url) return API_PREFIX;
  return url.startsWith(API_PREFIX) ? url : `${API_PREFIX}${url}`;
};

// Add this helper function after the existing helper functions
const filterDuplicateParams = (queryParams: string[], pathParams: string[]): string[] => {
  const pathParamSet = new Set(pathParams);
  return queryParams.filter(param => !pathParamSet.has(param));
};

// Add this helper at the top with other utility functions
const isValidInteger = (value: number): boolean => {
  return Number.isSafeInteger(value);
};

const ApiForm = () => {
  // Add a new state to track if we're in post-creation edit mode
  const [isPostCreate, setIsPostCreate] = useState(false);

  const [apiEndpoint, setApiEndpoint] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [httpMethods, setHttpMethods] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { addEndpoint, getEndpoint, updateEndpoint, endpoints } = useApiEndpoints();
  const navigate = useNavigate();
  
  // Add a state to track the current endpoint ID after creation
  const [currentEndpointId, setCurrentEndpointId] = useState<string | null>(null);

  // Update isNameUnique to use the tracked endpoint ID
  const isNameUnique = (name: string, currentId?: string): boolean => {
    const normalizedName = name.toLowerCase();
    const effectiveId = currentId || currentEndpointId;
    return !endpoints.some(endpoint => 
      endpoint.name.toLowerCase() === normalizedName && 
      endpoint.id !== effectiveId
    );
  };

  // Get the endpoint ID from the URL if we're editing
  const params = new URLSearchParams(window.location.search);
  const editEndpointId = params.get('edit');
  const testEndpointId = params.get('test');

  // Add this helper function near the top of the component
  const getFormTitle = () => {
    if (editEndpointId || isPostCreate) {
      return 'Edit API Endpoint';
    }
    if (testEndpointId) {
      return 'Test API Endpoint';
    }
    return 'Create API Endpoint';
  };

  // Load HTTP methods from config
  useEffect(() => {
    const loadHttpMethods = async () => {
      try {
        console.log('Loading HTTP methods from config...');
        const response = await fetch('/config/httpMethods.json');
        const data = await response.json();
        console.log('Loaded HTTP methods:', data.methods);
        setHttpMethods(data.methods);
      } catch (error) {
        console.error('Failed to load HTTP methods:', error);
        // Fallback to default methods if config file is not available
        const defaultMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
        console.log('Using default HTTP methods:', defaultMethods);
        setHttpMethods(defaultMethods);
      }
    };
    loadHttpMethods();
  }, []);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      method: 'GET',
      url: '',
      pathParams: [],
      queryParams: [],
      payloadParams: [],
      sqlQuery: '',
      sqlProcedure: '',
      status: 'active',
      requireToken: false,  // Add this line
    }
  });

  // useFieldArray hook for managing path parameters
  const { fields: pathParamFields, append: appendPathParam, remove: removePathParam } = useFieldArray({
    control: form.control,
    name: "pathParams",
  });

  // Add field array for query parameters
  const { fields: queryParamFields, append: appendQueryParam, remove: removeQueryParam } = useFieldArray({
    control: form.control,
    name: "queryParams",
  });

  // Add state for tracking query parameters
  const [detectedQueryParams, setDetectedQueryParams] = useState<string[]>([]);
  const [payload, setPayload] = useState<string>('');
  const [payloadError, setPayloadError] = useState<string | null>(null);
  const [payloadParams, setPayloadParams] = useState<Record<"id", string>[]>([]);

  // Add function to check for dollar sign parameters
  const hasDollarParam = (sql?: string): boolean => {
    if (!sql) return false;
    const dollarParamRegex = /\$(\w+)/g;
    return !!sql.match(dollarParamRegex);
  };

  // Load existing endpoint data if editing, or reset if not
  useEffect(() => {
    setIsLoading(true);
    const timerId = setTimeout(() => {
      if (editEndpointId) {
        const existingEndpoint = getEndpoint(editEndpointId);
        if (existingEndpoint) {
          // Set the payload if it exists
          if (existingEndpoint.payload) {
            setPayload(existingEndpoint.payload);
            // Extract and update payload parameters
            const params = extractPayloadParams(existingEndpoint.payload);
            const currentParams = form.getValues("payloadParams") || [];
            const currentParamNames = new Set(currentParams.map(p => p.name));

            // Add new parameters
            params.forEach(({ name, type }) => {
              if (!currentParamNames.has(name)) {
                appendPayloadParam({ name, type, required: true });
              }
            });

            // Remove obsolete parameters
            currentParams.forEach((param, index) => {
              if (!params.some(p => p.name === param.name)) {
                removePayloadParam(index);
              }
            });
          }

          // Preserve types exactly as they are in the endpoint configuration
          const formData = {
            ...existingEndpoint,
            pathParams: existingEndpoint.pathParams?.map(param => ({
              ...param,
              type: param.type || 'string',
              required: param.required ?? true,
              stringConstraints: param.stringConstraints || undefined,
              numberConstraints: param.type === 'number' ? {
                precision: param.numberConstraints?.precision ?? 0,
                minimum: param.numberConstraints?.minimum,
                maximum: param.numberConstraints?.maximum
              } : undefined,
              dateConstraints: param.dateConstraints || undefined
            })) || [],
            queryParams: existingEndpoint.queryParams?.map(param => ({
              ...param,
              type: param.type || 'string',
              required: param.required ?? true,
              stringConstraints: param.stringConstraints || undefined,
              numberConstraints: param.type === 'number' ? {
                precision: param.numberConstraints?.precision ?? 0,
                minimum: param.numberConstraints?.minimum,
                maximum: param.numberConstraints?.maximum
              } : undefined,
              dateConstraints: param.dateConstraints || undefined
            })) || [],
            payloadParams: existingEndpoint.payloadParams?.map(param => ({
              ...param,
              type: param.type || 'string',
              required: param.required ?? true,
              stringConstraints: param.stringConstraints || undefined,
              numberConstraints: param.type === 'number' ? {
                precision: param.numberConstraints?.precision ?? 0,
                minimum: param.numberConstraints?.minimum,
                maximum: param.numberConstraints?.maximum
              } : undefined,
              dateConstraints: param.dateConstraints || undefined
            })) || []
          };

          console.log('Loading endpoint with data:', formData);
          form.reset(formData);
        }
      }
      setIsLoading(false);
    }, 0);

    return () => clearTimeout(timerId);
  }, [editEndpointId, getEndpoint, form]);

  // Remove the URL watch effect and add this new function
  const syncPathParameters = (urlValue: string) => {
    const detectedParams = extractPathParamsFromUrl(urlValue);
    const currentParams = (form.getValues("pathParams") || []).filter(p => p && typeof p.name === 'string');

    const currentParamNames = new Set(currentParams.map(p => p.name));
    const detectedParamNames = new Set(detectedParams);

    // Add newly detected parameters
    detectedParams.forEach(name => {
      if (!currentParamNames.has(name)) {
        const required = isStructurallyRequired(urlValue, name);
        appendPathParam({ name, type: 'string', required });
      }
    });

    // Update required status for existing parameters
    currentParams.forEach((param, index) => {
      const structurallyRequired = isStructurallyRequired(urlValue, param.name);
      if (structurallyRequired && param.required !== true) {
        form.setValue(`pathParams.${index}.required`, true, { shouldDirty: true });
      }
    });

    // Remove parameters no longer in the URL
    currentParams.forEach((param, index) => {
      if (!detectedParamNames.has(param.name)) {
        removePathParam(index);
      }
    });
  };

  // Watch SQL fields for parameter detection
  const sqlQuery = form.watch("sqlQuery");
  const sqlProcedure = form.watch("sqlProcedure");

  // Update detected query parameters when SQL changes
  useEffect(() => {
    console.log('SQL Query changed:', sqlQuery);
    console.log('SQL Procedure changed:', sqlProcedure);
    const params = new Set([
      ...extractQueryParams(sqlQuery),
      ...extractQueryParams(sqlProcedure)
    ]);
    // Get current path parameters
    const pathParams = extractPathParamsFromUrl(form.getValues("url"));
    console.log('Detected path parameters:', pathParams);
    // Filter out query parameters that match path parameters
    const filteredParams = filterDuplicateParams(Array.from(params), pathParams);
    console.log('Final filtered query parameters:', filteredParams);
    setDetectedQueryParams(filteredParams);
  }, [sqlQuery, sqlProcedure, form]);

  // Sync detected parameters with form
  useEffect(() => {
    const currentParams = form.getValues("queryParams") || [];
    const currentParamNames = new Set(currentParams.map(p => p.name));

    // Add new parameters
    detectedQueryParams.forEach(name => {
      if (!currentParamNames.has(name)) {
        appendQueryParam({ name, type: 'string', required: true });
      }
    });

    // Remove obsolete parameters
    currentParams.forEach((param, index) => {
      if (!detectedQueryParams.includes(param.name)) {
        removeQueryParam(index);
      }
    });
  }, [detectedQueryParams, appendQueryParam, removeQueryParam, form]);

  // Watch the method field to update the SQL procedure visibility
  const method = form.watch("method");
  console.log('Current method value:', method);

  // Add function to extract parameters from JSON payload
  type PayloadParam = {
    name: string;
    type: 'string' | 'number' | 'object' | 'array' | 'date';
  };
  
  const extractPayloadParams = (jsonStr: string): PayloadParam[] => {
    try {
      if (!jsonStr) return [];
      const obj = JSON.parse(jsonStr);
      const params: PayloadParam[] = [];
      const arrayPaths: Set<string> = new Set();
  
      const extractNestedParams = (obj: any, prefix: string = '') => {
        if (Array.isArray(obj)) {
          // Only add array once
          if (!arrayPaths.has(prefix)) {
            params.push({ name: `${prefix}[]`, type: 'array' });
            arrayPaths.add(prefix);
          }
  
          if (obj.length > 0) {
            extractNestedParams(obj[0], `${prefix}[]`);
          }
        } else if (typeof obj === 'object' && obj !== null) {
          // Add object if not root
          if (prefix && !params.find(p => p.name === prefix)) {
            params.push({ name: prefix, type: 'object' });
          }
  
          Object.entries(obj).forEach(([key, value]) => {
            const paramName = prefix ? `${prefix}.${key}` : key;
            extractNestedParams(value, paramName);
          });
        } else {
          // Primitive types
          let type: 'string' | 'number' | 'object' | 'array' | 'date' = 'string';
          if (typeof obj === 'number') type = 'number';
          else if (typeof obj === 'object') type = 'object'; 
          else if (Array.isArray(obj)) type = 'array';
          else if (typeof obj === 'string' && prefix.toLowerCase().includes('date')) type = 'date';
  
          params.push({ name: prefix, type });
        }
      };
  
      extractNestedParams(obj);
      return params;
    } catch (error) {
      return [];
    }
  };  

  // Add field array for payload parameters
  const { fields: payloadParamFields, append: appendPayloadParam, remove: removePayloadParam } = useFieldArray({
    control: form.control,
    name: "payloadParams",
  });

  const onSubmit = async (data: FormValues) => {
    try {
      // Use tracked endpoint ID for post-create updates
      const effectiveId = editEndpointId || currentEndpointId || `endpoint_${Date.now()}`;

      if (!isNameUnique(data.name, effectiveId)) {
        form.setError("name", {
          type: "manual",
          message: "An endpoint with this name already exists"
        });
        toast.error("Endpoint name must be unique");
        return;
      }

      // Check for payload validation if needed
      if (method !== "GET" && hasDollarParam(data.sqlProcedure)) {
        if (!payload) {
          toast.error("JSON payload is required");
          return;
        }
        if (payloadError) {
          toast.error("Please fix JSON payload errors");
          return;
        }
      }
      
      // Format parameters while preserving types
      const formatParameters = (params: any[]) => params.map(param => ({
        name: param.name,
        type: param.type,
        required: Boolean(param.required),
        ...(param.type === 'string' && param.stringConstraints && {
          stringConstraints: {
            maxLength: param.stringConstraints.maxLength 
              ? Number(param.stringConstraints.maxLength) 
              : undefined,
            allowedValues: param.stringConstraints.allowedValues || undefined
          }
        }),
        ...(param.type === 'number' && param.numberConstraints && {
          numberConstraints: {
            minimum: param.numberConstraints.minimum,
            maximum: param.numberConstraints.maximum,
            precision: param.numberConstraints.precision
          }
        }),
        ...(param.type === 'date' && param.dateConstraints && {
          dateConstraints: {
            dateFormat: param.dateConstraints.dateFormat
          }
        })
      }));

      const validPathParams = formatParameters(data.pathParams || []);
      const validQueryParams = formatParameters(data.queryParams || []);
      const validPayloadParams = formatParameters(data.payloadParams || []);

      // Create the endpoint object with all necessary fields
      const endpoint: ApiEndpoint = {
        id: effectiveId,
        name: data.name,
        method: data.method,
        url: ensureApiPrefix(data.url),
        requireToken: data.requireToken,
        pathParams: validPathParams,
        queryParams: validQueryParams,
        payloadParams: validPayloadParams,
        payload: method !== "GET" && hasDollarParam(data.sqlProcedure) ? payload : undefined,
        sqlQuery: data.sqlQuery || '',
        sqlProcedure: data.sqlProcedure || '',
        status: data.status,
        lastUsed: new Date().toISOString(),
        requestCount: editEndpointId ? undefined : 0,
      };

      console.log('Saving endpoint with data:', JSON.stringify(endpoint, null, 2)); // Improved logging

      if (editEndpointId || isPostCreate) {
        await updateEndpoint(endpoint);
        toast.success("API endpoint updated successfully!");
        form.reset(endpoint);
      } else {
        await addEndpoint(endpoint);
        setApiEndpoint(data.url);
        setCurrentEndpointId(effectiveId);
        setIsPostCreate(true);
        toast.success("API endpoint created successfully! You can now test it.");
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('test', endpoint.id);
        navigate(newUrl.pathname + newUrl.search);
        form.reset(endpoint);
      }
    } catch (error) {
      console.error('Error saving endpoint:', error);
      toast.error("Failed to save endpoint");
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    try {
      const result = await oracleApiService.testConnection();
      
      if (result.success) {
        toast.success("Successfully connected to database");
      } else {
        toast.error(result.error || "Failed to connect to database");
      }
    } finally {
      setIsTesting(false);
    }
  };

  const copyToClipboard = () => {
    if (!apiEndpoint) return;
    
    navigator.clipboard.writeText(window.location.origin + apiEndpoint)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast.success("API URL copied to clipboard");
      })
      .catch(err => {
        console.error("Failed to copy:", err);
      });
  };

  const renderParameterFields = (
    paramFields: Record<"id", string>[],
    fieldArrayName: "pathParams" | "queryParams" | "payloadParams"
  ) => {
    return paramFields.map((field, index) => (
      <TableRow key={field.id}>
        <TableCell className="py-2 align-top w-[45%]">
          <FormField
            control={form.control}
            name={`${fieldArrayName}.${index}.name`}
            render={({ field }) => (
              <FormItem className="space-y-0">
                <FormControl>
                  <Input placeholder="Parameter Name" {...field} readOnly className="h-8" />
                </FormControl>
              </FormItem>
            )}
          />
        </TableCell>
        <TableCell className="py-2 align-top w-[45%]">
          <div className="space-y-2">
            <FormField
              control={form.control}
              name={`${fieldArrayName}.${index}.type`}
              render={({ field }) => (
                <FormItem className="space-y-0">
                  <Select 
                    onValueChange={field.onChange} 
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger className="h-8 bg-amber-50">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {field.value === 'object' ? (
                        <SelectItem value="object" disabled>Object</SelectItem>
                      ) : field.value === 'array' ? (
                        <SelectItem value="array" disabled>Array</SelectItem>
                      ) : (
                        <>
                          <SelectItem value="string">String</SelectItem>
                          <SelectItem value="number">Number</SelectItem>
                          <SelectItem value="date">Date</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            
            {form.watch(`${fieldArrayName}.${index}.type`) === 'number' && (
              <div className="space-y-2">
                {/* Precision Field First */}
                <div className="flex gap-2">
                  <FormField
                    control={form.control}
                    name={`${fieldArrayName}.${index}.numberConstraints.precision`}
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            max={10}
                            step={1}
                            required
                            placeholder="Precision"
                            {...field}
                            value={field.value ?? ''}
                            onChange={(e) => {
                              const value = e.target.value ? parseInt(e.target.value, 10) : undefined;
                              field.onChange(value);
                            }}
                            className={`h-8 bg-amber-50 ${form.formState.errors[fieldArrayName]?.[index]?.numberConstraints?.precision ? 'border-red-500' : ''}`}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4 p-0"
                          onClick={(e) => e.preventDefault()}
                        >
                          <Info className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Precision: 0 for integers, 1-10 for decimals</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                {/* Min/Max Value Fields */}
                <div className="flex gap-2">
                  <FormField
                    control={form.control}
                    name={`${fieldArrayName}.${index}.numberConstraints.minimum`}
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormControl>
                          <Input
                            type="number"
                            step="any"
                            placeholder="Min Value"
                            {...field}
                            value={field.value ?? ''}
                            onChange={(e) => {
                              const value = e.target.value ? parseFloat(e.target.value) : undefined;
                              field.onChange(value);
                            }}
                            className={`h-8 ${form.formState.errors[fieldArrayName]?.[index]?.numberConstraints?.minimum ? 'border-red-500' : ''}`}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`${fieldArrayName}.${index}.numberConstraints.maximum`}
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormControl>
                          <Input
                            type="number"
                            step="any"
                            placeholder="Max Value"
                            {...field}
                            value={field.value ?? ''}
                            onChange={(e) => {
                              const value = e.target.value ? parseFloat(e.target.value) : undefined;
                              field.onChange(value);
                            }}
                            className={`h-8 ${form.formState.errors[fieldArrayName]?.[index]?.numberConstraints?.maximum ? 'border-red-500' : ''}`}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            )}

            {form.watch(`${fieldArrayName}.${index}.type`) === 'string' && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <FormField
                    control={form.control}
                    name={`${fieldArrayName}.${index}.stringConstraints.maxLength`}
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            placeholder="Max Length"
                            {...field}
                            value={field.value || ''}
                            onChange={(e) => {
                              const value = e.target.value ? parseInt(e.target.value, 10) : undefined;
                              if (value && !isValidInteger(value)) {
                                toast.error("Value is too large for a safe integer");
                                return;
                              }
                              field.onChange(value);
                            }}
                            className="h-8"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4 p-0"
                          onClick={(e) => e.preventDefault()}
                        >
                          <Info className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Maximum length for this string parameter</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="flex gap-2">
                  <FormField
                    control={form.control}
                    name={`${fieldArrayName}.${index}.stringConstraints.allowedValues`}
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormControl>
                          <Input
                            placeholder="Allowed values (e.g., Y, N)"
                            {...field}
                            className="h-8"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4 p-0"
                          onClick={(e) => e.preventDefault()}
                        >
                          <Info className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Comma-separated list of allowed values</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            )}

            {form.watch(`${fieldArrayName}.${index}.type`) === 'date' && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <FormField
                    control={form.control}
                    name={`${fieldArrayName}.${index}.dateConstraints.dateFormat`}
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormControl>
                          <Input
                            type="text"
                            placeholder="Date format (e.g., YYYY-MM-DD)"
                            {...field}
                            required
                            value={field.value}
                            onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                            className="h-8 bg-amber-50"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4 p-0"
                          onClick={(e) => e.preventDefault()}
                        >
                          <Info className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Date format: e.g., YYYY-MM-DD, YYYY-MM-DD HH:MI:SS AM</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            )}
          </div>
        </TableCell>
        <TableCell className="py-2 align-top w-[10%]">
          <div className="h-8 flex items-center">
            <FormField
              control={form.control}
              name={`${fieldArrayName}.${index}.required`}
              render={({ field }) => {
                const paramName = form.getValues(`${fieldArrayName}.${index}.name`);
                const structurallyRequired = isStructurallyRequired(form.getValues("url"), paramName);
                return (
                  <FormItem>
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={structurallyRequired}
                        className="h-4 w-4"
                      />
                    </FormControl>
                  </FormItem>
                );
              }}
            />
          </div>
        </TableCell>
      </TableRow>
    ));
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl font-bold text-blue-600">
                {getFormTitle()}
              </CardTitle>
              <CardDescription>
                {(editEndpointId || isPostCreate) 
                  ? 'Modify your API endpoint and SQL query'
                  : testEndpointId 
                    ? 'Test your API endpoint'
                    : 'Define your API endpoint and SQL query'
                }
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                 // Render a simple loading indicator or skeleton
                 <div className="text-center p-8">
                     <p>Loading endpoint data...</p>
                     {/* Optionally add a spinner component */}
                 </div>
              ) : (
                 // Render the actual form content only when not loading
                 <>
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Endpoint Name</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="getCustomers" 
                              {...field} 
                              className={`border-blue-200 focus-visible:ring-blue-500 bg-amber-50 ${
                                form.formState.errors.name ? 'border-red-500' : ''
                              }`}
                              onBlur={(e) => {
                                field.onBlur();
                                if (!isNameUnique(e.target.value, editEndpointId)) {
                                  form.setError("name", {
                                    type: "manual",
                                    message: "An endpoint with this name already exists"
                                  });
                                }
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex gap-4">
                      <FormField
                        key={editEndpointId || 'new-endpoint-method'}
                        control={form.control}
                        name="method"
                        render={({ field }) => (
                          <FormItem className="w-[120px]">
                            <FormLabel>HTTP Method</FormLabel>
                            <FormControl>
                              <Select
                                value={field.value}
                                onValueChange={field.onChange}
                              >
                                <SelectTrigger className="w-full border-blue-200 focus-visible:ring-blue-500 bg-amber-50">
                                  <SelectValue placeholder="Method" />
                                </SelectTrigger>
                                <SelectContent>
                                  {httpMethods.map((method) => (
                                    <SelectItem key={method} value={method}>
                                      {method}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="url"
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormLabel>URL</FormLabel>
                            <div className="flex items-center">
                              <div className="flex-none">
                                <div className="h-10 px-3 inline-flex items-center border border-r-0 rounded-l-md bg-muted text-muted-foreground font-mono">
                                  {API_PREFIX}
                                </div>
                              </div>
                              <FormControl>
                                <Input 
                                  placeholder="users/{id}" 
                                  value={stripApiPrefix(field.value)}
                                  onChange={(e) => {
                                    const newPath = e.target.value.startsWith('/') ? e.target.value.substring(1) : e.target.value;
                                    field.onChange(ensureApiPrefix(newPath));
                                  }}
                                  onBlur={(e) => {
                                    field.onBlur();
                                    syncPathParameters(field.value);
                                  }}
                                  className="rounded-l-none border-l-0 focus:ring-offset-0 focus-visible:ring-offset-0 border-blue-200 focus-visible:ring-blue-500 bg-amber-50"
                                />
                              </FormControl>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="flex items-center space-x-2 mt-2">
                      <FormField
                        control={form.control}
                        name="requireToken"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center space-x-2">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-0.5">
                              <FormLabel>Require Token</FormLabel>
                            </div>
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="sqlQuery">SQL Query</Label>
                      <Textarea
                        id="sqlQuery"
                        placeholder="Enter your SQL query..."
                        className="min-h-[100px] font-mono"
                        {...form.register("sqlQuery")}
                      />
                      {form.formState.errors.sqlQuery && (
                        <p className="text-sm text-red-500">{form.formState.errors.sqlQuery.message}</p>
                      )}
                    </div>

                    {method !== "GET" && (
                      <div className="space-y-2">
                        <Label htmlFor="sqlProcedure">SQL Procedure</Label>
                        <Textarea
                          id="sqlProcedure"
                          placeholder="Enter your SQL procedure for data modification..."
                          className="min-h-[100px] font-mono"
                          {...form.register("sqlProcedure")}
                        />
                        {form.formState.errors.sqlProcedure && (
                          <p className="text-sm text-red-500">{form.formState.errors.sqlProcedure.message}</p>
                        )}
                      </div>
                    )}

                    <Separator />
                    <div>
                      <h3 className="text-lg font-medium mb-2">Path Parameters</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Define parameters in the URL (e.g., /users/&#123;userId&#125;).
                      </p>
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="w-[40%]">Name</TableHead>
                            <TableHead className="w-[50%]">Type</TableHead>
                            <TableHead className="w-[10%]">Required</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {renderParameterFields(pathParamFields, "pathParams")}
                        </TableBody>
                      </Table>
                    </div>

                    <Separator className="my-4" />
                    <div>
                      <h3 className="text-lg font-medium mb-2">Query Parameters</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Define parameters in the SQL Query/Procedure (e.g., :userId).
                      </p>
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="w-[40%]">Name</TableHead>
                            <TableHead className="w-[50%]">Type</TableHead>
                            <TableHead className="w-[10%]">Required</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {renderParameterFields(queryParamFields, "queryParams")}
                        </TableBody>
                      </Table>
                    </div>

                    <Separator className="my-4" />
                    {/* Add Request Payload field when SQL Procedure contains dollar sign */}
                    {method !== "GET" && hasDollarParam(form.watch("sqlProcedure")) && (
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
                            onChange={(e) => {
                              setPayload(e.target.value);
                              try {
                                if (e.target.value) {
                                  JSON.parse(e.target.value);
                                  setPayloadError(null);
                                  // Extract and update payload parameters
                                  const params = extractPayloadParams(e.target.value);
                                  console.log("params", params);
                                  const currentParams = form.getValues("payloadParams") || [];
                                  const currentParamNames = new Set(currentParams.map(p => p.name));

                                  // Add new parameters
                                  params.forEach(({ name, type }) => {
                                    if (!currentParamNames.has(name)) {
                                      appendPayloadParam({ name, type, required: true });
                                    }
                                  });

                                  // Remove obsolete parameters
                                  currentParams.forEach((param, index) => {
                                    if (!params.some(p => p.name === param.name)) {
                                      removePayloadParam(index);
                                    }
                                  });
                                } else {
                                  setPayloadError(null);
                                  // Clear payload parameters if payload is empty
                                  form.setValue("payloadParams", []);
                                }
                              } catch (error) {
                                setPayloadError('Invalid JSON format');
                              }
                            }}
                            className="min-h-[100px] font-mono mt-2"
                            aria-invalid={!!payloadError}
                          />
                          {payloadError && (
                            <p className="text-sm font-medium text-destructive mt-2">{payloadError}</p>
                          )}
                        </div>
                      </div>
                    )}

                    <Separator className="my-4" />
                    {/* Add Payload Parameters section */}
                    {method !== "GET" && hasDollarParam(form.watch("sqlProcedure")) && payloadParamFields.length > 0 && (
                      <>
                        <Separator className="my-4" />
                        <div>
                          <h3 className="text-lg font-medium mb-2">Payload Parameters</h3>
                          <p className="text-sm text-muted-foreground mb-4">
                            Define parameters from the JSON payload.
                          </p>
                          <Table>
                            <TableHeader>
                              <TableRow className="hover:bg-transparent">
                                <TableHead className="w-[40%]">Name</TableHead>
                                <TableHead className="w-[50%]">Type</TableHead>
                                <TableHead className="w-[10%]">Required</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {renderParameterFields(payloadParamFields, "payloadParams")}
                            </TableBody>
                          </Table>
                        </div>
                      </>
                    )}
                 </>
              )}
            </CardContent>
            <CardFooter className="flex justify-end gap-2">
                 <Button 
                   type="submit" 
                   className="bg-blue-600 hover:bg-blue-700"
                   disabled={isLoading}
                 >
                   {isLoading ? 'Loading...' : (editEndpointId || isPostCreate ? 'Update Endpoint' : 'Create Endpoint')}
                 </Button>
                 <Button
                   type="button"
                   variant="outline"
                   onClick={handleTestConnection}
                   disabled={isTesting || isLoading}
                 >
                   {isTesting ? 'Testing...' : 'Test Connection'}
                 </Button>
             </CardFooter>
          </Card>
        </form>
      </Form>
    </div>
  );
};

export default ApiForm;
