import { ApiEndpoint } from "@/contexts/ApiEndpointsContext";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { CodeBlock } from "./ui/code-block";

interface ApiUsagePreviewProps {
  endpoint: ApiEndpoint;
}

export const ApiUsagePreview = ({ endpoint }: ApiUsagePreviewProps) => {
  const baseUrl = `http://localhost:3001`;
  const endpointUrl = `${baseUrl}/api/${endpoint.name}`;

  const curlExample = `curl -X POST ${endpointUrl} \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json" \\
  -d '{
    "parameters": {
      // Add your query parameters here
    }
  }'`;

  const postmanExample = {
    method: "POST",
    url: endpointUrl,
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: {
      parameters: {}
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>API Usage Examples</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h3 className="font-medium mb-2">cURL Example</h3>
          <CodeBlock code={curlExample} />
        </div>
        <div>
          <h3 className="font-medium mb-2">Postman Example</h3>
          <CodeBlock code={JSON.stringify(postmanExample, null, 2)} />
        </div>
      </CardContent>
    </Card>
  );
}; 