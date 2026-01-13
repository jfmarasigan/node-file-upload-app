import { ApiEndpoint } from "@/contexts/ApiEndpointsContext";
import { toast } from "sonner";

export interface QueryResult {
  success: boolean;
  data?: any[];
  error?: string;
  query?: string;
  parameters?: Record<string, any>;
  execution_time?: string;
  errors?: string[];
}

// Use environment variable with fallback for development
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

let authToken: string | null = null;

export const oracleApiService = {
  testConnection: async (): Promise<{ success: boolean; message?: string; error?: string }> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/test-connection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }

      const result = await response.json();
      if (result.success) {
        toast.success(result.message || "Successfully connected to database");
      } else {
        toast.error(result.error || "Failed to connect to database");
      }
      return result;
    } catch (error) {
      console.error('Error testing connection:', error);
      toast.error(error instanceof Error ? error.message : "Failed to connect to server");
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to connect to server"
      };
    }
  },

  setAuthToken: (token: string) => {
    authToken = token;
  },

  executeQuery: async (
    endpoint: ApiEndpoint,
    parameters: Record<string, any> = {}
  ): Promise<QueryResult> => {
    const startTime = performance.now();
    
    try {
      // Parse the SQL query to extract parameter names (Needed for validation only if NOT procedure)
      let paramNames: string[] = [];
      let isProcedure = endpoint.method !== 'GET' && !!endpoint.sqlProcedure;
      if (!isProcedure) {
           paramNames = extractSqlParamsClient(endpoint.sqlQuery).inputs;
      }
      // Note: Parameter validation against `parameters` object should consider
      // that `parameters` already contains merged path/query/body params from client/server.
      // Server-side validation is the primary guard.
      
      // Construct the final URL *directly from the provided endpoint.url*
      // No need to re-parse or add query params here, client prepares the final URL/body
      const finalUrl = `${API_BASE_URL}${endpoint.url.startsWith('/') ? endpoint.url : `/${endpoint.url}`}`;
      
      // Create URL object to potentially add query params
      const urlObject = new URL(finalUrl);

      // Prepare request options
      const requestOptions: RequestInit = {
        method: endpoint.method,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        mode: 'cors',
        credentials: 'include',
      };

      // Add body for non-GET requests OR add query params for GET requests
      if (endpoint.method === 'GET') {
          // Append parameters to URL search params for GET
          Object.entries(parameters).forEach(([key, value]) => {
              // Ensure value is a string before appending
              if (value !== undefined && value !== null) {
                  urlObject.searchParams.append(key, String(value));
              }
          });
          console.log('GET request - URL with query params:', urlObject.toString());
      } else {
        // Add Content-Type and body for non-GET requests
        requestOptions.headers = {
          ...requestOptions.headers,
          'Content-Type': 'application/json',
        };
        requestOptions.body = JSON.stringify(parameters);
        console.log('Non-GET request - Body:', requestOptions.body);
      }
      
      if (authToken) {
        requestOptions.headers['Authorization'] = authToken;
      }

      // Use the potentially modified URL object for the fetch call
      const requestUrl = urlObject.toString();
      
      console.log('Executing API request:', {
        method: endpoint.method,
        requestUrl: requestUrl,
        options: requestOptions
      });

      // Use requestUrl directly
      const response = await fetch(requestUrl, requestOptions);
      
      if (!response.ok) {
        // Try to parse error response as JSON first
        let errorMessage;
        try {
          const errorData = await response.json();
          if (errorData.errors && Array.isArray(errorData.errors)) {
            errorMessage = errorData.errors.join('\n');
          } else {
            errorMessage = errorData.error || 'Unknown error occurred';
          }
        } catch {
          // If not JSON, get text
          errorMessage = await response.text();
        }
        throw new Error(errorMessage);
      }
      
      const result = await response.json();
      
      const endTime = performance.now();
      const executionTime = `${Math.round(endTime - startTime)}ms`;
      
      if (result.success) {
        toast.success("Query executed successfully");
        return {
          ...result,
          execution_time: executionTime,
        };
      } else {
        // Handle validation errors in the response
        if (result.errors && Array.isArray(result.errors)) {
          const errorMessage = result.errors.join('\n');
          toast.error(errorMessage);
          return {
            success: false,
            error: errorMessage,
            errors: result.errors
          };
        } else {
          toast.error(result.error || "Unknown database error occurred");
          return result;
        }
      }
    } catch (error) {
      console.error('Error executing query:', error);
      let errorMessage = 'Failed to connect to server';
      
      // Check for network errors
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        errorMessage = 'Cannot connect to server. Please check if the server is running.';
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      toast.error(errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }
};

// Client-side helper (ensure it's defined if not already imported/shared)
const extractSqlParamsClient = (sql?: string): { inputs: string[], outputs: string[] } => {
  if (!sql) return { inputs: [], outputs: [] };
  const inputRegex = /:([\w_]+)/g;
  const outputRegex = /@([\w_]+)/g;
  const inputs = [...new Set([...sql.matchAll(inputRegex)].map(match => match[1]))];
  const outputs = [...new Set([...sql.matchAll(outputRegex)].map(match => match[1]))];
  const finalInputs = inputs.filter(inputName => !outputs.includes(inputName));
  return { inputs: finalInputs, outputs };
};
