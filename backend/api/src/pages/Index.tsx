
import { Navigate } from 'react-router-dom';

const Index = () => {
  // Redirect to the Dashboard page
  return <Navigate to="/dashboard" replace />;
};

export default Index;
