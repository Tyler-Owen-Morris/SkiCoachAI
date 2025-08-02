import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Snowflake } from "lucide-react";

export default function Landing() {
  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col justify-center px-6">
      <div className="text-center mb-12">
        <div className="w-20 h-20 bg-primary rounded-full mx-auto mb-6 flex items-center justify-center">
          <Snowflake className="text-white text-2xl" size={32} />
        </div>
        <h1 className="text-3xl font-medium text-neutral-800 mb-2">Ski Coach AI</h1>
        <p className="text-neutral-600">Voice-powered coaching assistant</p>
      </div>
      
      <div className="space-y-4">
        <Button 
          onClick={handleLogin}
          className="w-full bg-primary text-white py-4 rounded-lg font-medium text-base hover:bg-primary-dark transition-colors h-12"
        >
          Sign In
        </Button>
      </div>
      
      <p className="text-center text-neutral-400 text-sm mt-8">
        Welcome to your AI-powered coaching assistant
      </p>
    </div>
  );
}
