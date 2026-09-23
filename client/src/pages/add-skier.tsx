import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { SKIER_LEVELS } from "@shared/sync";
import { getServices, afterLocalWrite } from "@/app/services";
import { createSkier } from "@/data/repo";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const skierFormSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(200),
  level: z.enum(SKIER_LEVELS, { errorMap: () => ({ message: "Pick a level" }) }),
  age: z.number().int().min(1).max(120).optional(),
  initialNotes: z.string().max(10_000).optional(),
});
type SkierForm = z.infer<typeof skierFormSchema>;

export default function AddSkier() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const form = useForm<SkierForm>({
    resolver: zodResolver(skierFormSchema),
    defaultValues: {
      name: "",
      level: undefined,
      age: undefined,
      initialNotes: "",
    },
  });

  // Saved on the phone immediately; uploads whenever there's signal.
  const onSubmit = async (data: SkierForm) => {
    await createSkier(getServices().db, {
      name: data.name.trim(),
      level: data.level,
      age: data.age ?? null,
      initialNotes: data.initialNotes?.trim() || null,
    });
    afterLocalWrite();
    toast({ title: `${data.name.trim()} added` });
    setLocation("/");
  };

  const goBack = () => {
    setLocation("/");
  };

  return (
    <div className="min-h-screen bg-neutral-50 safe-top">
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
                  disabled={form.formState.isSubmitting}
                  className="flex-1 py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary-dark transition-colors"
                >
                  {form.formState.isSubmitting ? "Adding..." : "Add Skier"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
