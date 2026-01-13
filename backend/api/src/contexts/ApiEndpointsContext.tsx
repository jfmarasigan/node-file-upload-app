import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// Define the structure for string constraints
interface StringConstraints {
  maxLength?: number;
  allowedValues?: string; // Store as comma-separated string
}

// Replace IntegerConstraints and DecimalConstraints with single NumberConstraints
interface NumberConstraints {
  minimum?: number;
  maximum?: number;
  precision?: number;  // 0 for integers, > 0 for decimals
}

// Define the structure for date constraints
interface DateConstraints {
  dateFormat?: string;
}

interface ParameterBase {
  name: string;
  type: 'string' | 'number' | 'date' | 'object' | 'array';  // Added object and array types
  required: boolean;
  stringConstraints?: StringConstraints;
  numberConstraints?: NumberConstraints;  // Replace both integer and decimal constraints
  dateConstraints?: DateConstraints;
}

// Define the structure for parameter configuration
export interface ParameterConfig extends ParameterBase {}

export type PathParameterConfig = ParameterConfig;
export type QueryParameterConfig = ParameterConfig;

// Define the endpoint type
export interface ApiEndpoint {
  id: string;
  name: string;
  method: string;
  url: string;
  pathParams?: PathParameterConfig[]; // Add optional array for path param configs
  queryParams: QueryParameterConfig[]; // Remove optional flag
  payloadParams?: QueryParameterConfig[]; // Add payload parameters
  payload?: string; // Add sample payload
  sqlQuery: string;
  sqlProcedure?: string;
  status: 'active' | 'inactive';
  lastUsed: string;
  requestCount?: number;
  database?: string;
  requireToken: boolean;  // Add this line
}

interface ApiEndpointsContextType {
  endpoints: ApiEndpoint[];
  addEndpoint: (endpoint: ApiEndpoint) => void;
  updateEndpoint: (endpoint: ApiEndpoint) => void;
  deleteEndpoint: (id: string) => void;
  getEndpoint: (id: string) => ApiEndpoint | undefined;
  toggleEndpointStatus: (id: string) => void;
  saveEndpoints: (endpoints: ApiEndpoint[]) => Promise<ApiEndpoint[]>;
  duplicateEndpoint: (id: string) => Promise<boolean>;
}

const ApiEndpointsContext = createContext<ApiEndpointsContextType | undefined>(undefined);

// Use environment variable with fallback for development
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
const API_PREFIX = '/api/';

const ensureApiPrefix = (url: string): string => {
  return url.startsWith(API_PREFIX) ? url : `${API_PREFIX}${url}`;
};

// Add these helper functions
const normalizeUrl = (url: string): string => {
  // Remove multiple consecutive slashes and ensure starts with /api/
  let normalized = url.replace(/\/+/g, '/');
  if (!normalized.startsWith(API_PREFIX)) {
    normalized = API_PREFIX + (normalized.startsWith('/') ? normalized.substring(1) : normalized);
  }
  // Remove trailing slash unless URL is just /api/
  return normalized.length > API_PREFIX.length && normalized.endsWith('/') 
    ? normalized.slice(0, -1) 
    : normalized;
};

const generateCopyName = (originalName: string, existingEndpoints: ApiEndpoint[]): string => {
  const copyPattern = /^(.*?)(?: copy( \d+)?)?$/;
  const match = originalName.match(copyPattern);
  const baseName = match ? match[1] : originalName;
  
  let counter = 1;
  let copyName = `${baseName} copy`;
  
  while (existingEndpoints.some(e => e.name === copyName)) {
    copyName = `${baseName} copy ${counter}`;
    counter++;
  }
  
  return copyName;
};

// Add this helper function at the top level
const normalizeParameter = (param: ParameterConfig): ParameterConfig => {
  const baseParam = {
    name: String(param.name),
    type: param.type,
    required: Boolean(param.required)
  };

  if (param.type === 'string' && param.stringConstraints) {
    return {
      ...baseParam,
      stringConstraints: param.stringConstraints
    };
  }

  if (param.type === 'number') {
    return {
      ...baseParam,
      numberConstraints: {
        precision: param.numberConstraints?.precision ?? 0,
        minimum: param.numberConstraints?.minimum,
        maximum: param.numberConstraints?.maximum
      }
    };
  }

  if (param.type === 'date' && param.dateConstraints) {
    return {
      ...baseParam,
      dateConstraints: param.dateConstraints
    };
  }

  return baseParam;
};

export const ApiEndpointsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [endpoints, setEndpoints] = useState<ApiEndpoint[]>([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Load endpoints from backend on component mount
  useEffect(() => {
    const loadEndpoints = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/endpoints`);
        if (response.ok) {
          const data = await response.json();
          // Normalize URLs and ensure queryParams exists
          const normalizedEndpoints = data.map((endpoint: ApiEndpoint) => ({
            ...endpoint,
            url: normalizeUrl(endpoint.url),
            pathParams: endpoint.pathParams || [],
            queryParams: endpoint.queryParams || [], // Ensure queryParams is never undefined
          }));
          setEndpoints(normalizedEndpoints);
          setIsInitialLoad(false);
        }
      } catch (error) {
        console.error('Error loading endpoints:', error);
        setIsInitialLoad(false);
      }
    };
    loadEndpoints();
  }, []);

  const saveEndpoints = async (endpointsToSave: ApiEndpoint[]): Promise<ApiEndpoint[]> => {
    try {
      const normalizedEndpoints = endpointsToSave.map(endpoint => ({
        ...endpoint,
        url: normalizeUrl(endpoint.url),
        pathParams: endpoint.pathParams?.map(param => normalizeParameter(param)) || [],
        queryParams: endpoint.queryParams?.map(param => normalizeParameter(param)) || [],
        payloadParams: endpoint.payloadParams?.map(param => normalizeParameter(param)) || [],
        payload: endpoint.payload // Include the payload
      }));

      console.log('Saving endpoints:', JSON.stringify(normalizedEndpoints, null, 2));

      const response = await fetch(`${API_BASE_URL}/api/endpoints`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(normalizedEndpoints),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Server error:', errorData);
        throw new Error(errorData.error || 'Failed to save endpoints');
      }

      const savedEndpoints = await response.json();
      console.log('Server response:', JSON.stringify(savedEndpoints, null, 2));

      // Ensure parameters are properly structured in saved data
      const finalEndpoints = savedEndpoints.map((endpoint: ApiEndpoint) => ({
        ...endpoint,
        queryParams: endpoint.queryParams || [],
        pathParams: endpoint.pathParams || [],
        payloadParams: endpoint.payloadParams || [],
        payload: endpoint.payload // Include the payload
      }));

      setEndpoints(finalEndpoints);
      return finalEndpoints;
    } catch (error) {
      console.error('Save error:', error);
      throw error;
    }
  };

  const addEndpoint = async (endpoint: ApiEndpoint) => {
    try {
      const updatedEndpoints = [...endpoints, endpoint];
      await saveEndpoints(updatedEndpoints);
    } catch (error) {
      console.error('Error adding endpoint:', error);
      throw error;
    }
  };

  const updateEndpoint = async (updatedEndpoint: ApiEndpoint) => {
    try {
      console.log('Updating endpoint:', updatedEndpoint);
      const updatedEndpoints = endpoints.map((endpoint) =>
        endpoint.id === updatedEndpoint.id ? updatedEndpoint : endpoint
      );
      console.log('Updated endpoints array:', updatedEndpoints);
      const savedEndpoints = await saveEndpoints(updatedEndpoints);
      console.log('Save response:', savedEndpoints);
    } catch (error) {
      console.error('Error updating endpoint:', error);
      throw error;
    }
  };

  const deleteEndpoint = async (id: string) => {
    try {
      const updatedEndpoints = endpoints.filter((endpoint) => endpoint.id !== id);
      await saveEndpoints(updatedEndpoints);
    } catch (error) {
      console.error('Error deleting endpoint:', error);
      throw error;
    }
  };

  const getEndpoint = (id: string): ApiEndpoint | undefined => {
    const endpoint = endpoints.find((e) => e.id === id);
    if (!endpoint) return undefined;

    // Ensure parameters are properly initialized when getting an endpoint
    return {
      ...endpoint,
      pathParams: endpoint.pathParams || [],
      queryParams: endpoint.queryParams || []
    };
  };

  const toggleEndpointStatus = async (id: string) => {
    try {
      const updatedEndpoints = endpoints.map((endpoint) =>
        endpoint.id === id
          ? { ...endpoint, status: endpoint.status === 'active' ? 'inactive' as const : 'active' as const }
          : endpoint
      );
      await saveEndpoints(updatedEndpoints);
    } catch (error) {
      console.error('Error toggling endpoint status:', error);
      throw error;
    }
  };

  const duplicateEndpoint = async (id: string): Promise<boolean> => {
    try {
      const sourceEndpoint = endpoints.find(e => e.id === id);
      if (!sourceEndpoint) return false;

      const duplicatedEndpoint: ApiEndpoint = {
        ...sourceEndpoint,
        id: `endpoint_${Date.now()}`,
        name: generateCopyName(sourceEndpoint.name, endpoints),
        pathParams: [...(sourceEndpoint.pathParams || [])],
        queryParams: [...(sourceEndpoint.queryParams || [])],
        lastUsed: new Date().toISOString(),
        requestCount: 0,
      };

      const updatedEndpoints = [...endpoints, duplicatedEndpoint];
      await saveEndpoints(updatedEndpoints);
      return true;
    } catch (error) {
      console.error('Error duplicating endpoint:', error);
      return false;
    }
  };

  return (
    <ApiEndpointsContext.Provider
      value={{ 
        endpoints, 
        addEndpoint, 
        updateEndpoint, 
        deleteEndpoint, 
        getEndpoint,
        toggleEndpointStatus,
        saveEndpoints,
        duplicateEndpoint
      }}
    >
      {children}
    </ApiEndpointsContext.Provider>
  );
};

export const useApiEndpoints = () => {
  const context = useContext(ApiEndpointsContext);
  if (context === undefined) {
    throw new Error('useApiEndpoints must be used within an ApiEndpointsProvider');
  }
  return context;
};
