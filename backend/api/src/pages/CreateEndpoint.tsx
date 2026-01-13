import React from 'react';
import NavBar from '@/components/NavBar';
import ApiForm from '@/components/ApiForm';
import ApiResultPreview from '@/components/ApiResultPreview';
import { Separator } from '@/components/ui/separator';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useApiEndpoints } from '@/contexts/ApiEndpointsContext';

const CreateEndpoint = () => {
  const [searchParams] = useSearchParams();
  const { getEndpoint } = useApiEndpoints();
  const navigate = useNavigate();
  
  const testEndpointId = searchParams.get('test');
  const editEndpointId = searchParams.get('edit');
  
  // Check if we have a valid endpoint for testing
  React.useEffect(() => {
    if (testEndpointId) {
      const endpoint = getEndpoint(testEndpointId);
      if (!endpoint) {
        // If the endpoint doesn't exist, redirect to the create page
        navigate('/create');
      }
    }
  }, [testEndpointId, getEndpoint, navigate]);

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      
      <main className="container mx-auto px-4 py-6">
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <ApiForm />
          </div>
          <div>
            <ApiResultPreview />
          </div>
        </div>
      </main>
    </div>
  );
};

export default CreateEndpoint;
