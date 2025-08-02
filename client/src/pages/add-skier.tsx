import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertSkierSchema, type InsertSkier } from "@shared/schema";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useEffect } from "react";

export default function AddSkier() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, authLoading, toast]);

  const form = useForm<InsertSkier>({
    resolver: zodResolver(insertSkierSchema),
    defaultValues: {
      name: "",
      level: "",
      age: undefined,
      initialNotes: "",
    },
  });

  const createSkierMutation = useMutation({
    mutationFn: async (data: InsertSkier) => {
      await apiRequest("POST", "/api/skiers", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/skiers"] });
      toast({
        title: "Success",
        description: "New skier added successfully!",
      });
      setLocation("/");
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to add skier. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertSkier) => {
    createSkierMutation.mutate(data);
  };

  const goBack = () => {
    setLocation("/");
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-neutral-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="p-4">
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-center space-x-4 mb-6">
            <button 
              onClick={goBack}
              className="p-2 rounded-full hover:bg-neutral-100 transition-colors"
            >
              <ArrowLeft className="text-neutral-600" size={20} />
            </button>
            <h2 className="text-lg font-medium text-neutral-800">Add New Skier</h2>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="block text-sm font-medium text-neutral-700">
                      Full Name
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter skier's full name"
                        {...field}
                        className="w-full px-4 py-3 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="level"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="block text-sm font-medium text-neutral-700">
                      Skill Level
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full px-4 py-3 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent">
                          <SelectValue placeholder="Select skill level" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="beginner">Beginner</SelectItem>
                        <SelectItem value="intermediate">Intermediate</SelectItem>
                        <SelectItem value="advanced">Advanced</SelectItem>
                        <SelectItem value="expert">Expert</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="age"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="block text-sm font-medium text-neutral-700">
                      Age (Optional)
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="Age"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                        value={field.value || ""}
                        className="w-full px-4 py-3 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="initialNotes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="block text-sm font-medium text-neutral-700">
                      Notes (Optional)
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Any initial notes about this skier..."
                        rows={3}
                        {...field}
                        value={field.value || ""}
                        className="w-full px-4 py-3 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex space-x-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={goBack}
                  className="flex-1 py-3 border border-neutral-200 text-neutral-600 rounded-lg font-medium hover:bg-neutral-50 transition-colors"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createSkierMutation.isPending}
                  className="flex-1 py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary-dark transition-colors"
                >
                  {createSkierMutation.isPending ? "Adding..." : "Add Skier"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
