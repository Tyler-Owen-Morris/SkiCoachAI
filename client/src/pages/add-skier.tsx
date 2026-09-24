import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { EQUIPMENT, SKIER_LEVELS, type ParsedSkier } from "@shared/sync";
import { getServices, afterLocalWrite } from "@/app/services";
import { useLocal } from "@/app/hooks";
import { createSkier, getSkier, updateSkier } from "@/data/repo";
import { parseSkierLocally } from "@/lib/parse-skier";
import type { SkierPhotoData } from "@/lib/photo";
import SkierPhotoCircle from "@/components/skier-photo-circle";
import { session } from "@/lib/session";
import { deleteAudio } from "@/voice/recorder";
import { formatDuration, useVoiceRecording } from "@/voice/use-voice-recording";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import EquipmentToggle from "@/components/equipment-toggle";

const skierFormSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(200),
  level: z.enum(SKIER_LEVELS, { errorMap: () => ({ message: "Pick a level" }) }),
  age: z.number().int().min(1).max(120).optional(),
  initialNotes: z.string().max(10_000).optional(),
  equipment: z.enum(EQUIPMENT),
});
type SkierForm = z.infer<typeof skierFormSchema>;

const VOICE_HINTS = [...SKIER_LEVELS, "years old", "jacket", "helmet", "pants", "goggles", "snowboard", "snowboarder", "skier"];

const inputClass =
  "w-full px-4 py-3 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent";

// Uses the AI when it's reachable, otherwise understands the description on
// the phone, so adding a skier never depends on signal.
async function understandDescription(transcript: string): Promise<{ parsed: ParsedSkier; byAi: boolean }> {
  const { api, engine } = getServices();
  const status = engine.getStatus();
  if (session.get().token && status.online && !status.authExpired) {
    try {
      return { parsed: await api.parseSkier(transcript), byAi: true };
    } catch {
      // Fall through to the on-device parser.
    }
  }
  return { parsed: parseSkierLocally(transcript), byAi: false };
}

// Add a skier (by voice or by hand), or edit one when skierId is given.
export default function AddSkier({ skierId }: { skierId?: string }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [heard, setHeard] = useState<string | null>(null);
  // Optional; applies whether the skier is added by voice or by the form.
  const [photo, setPhoto] = useState<SkierPhotoData | null>(null);
  const editing = !!skierId;
  const { data: existing } = useLocal(["skier", skierId ?? "new"], (db) =>
    skierId ? getSkier(db, skierId) : Promise.resolve(null),
  );

  const form = useForm<SkierForm>({
    resolver: zodResolver(skierFormSchema),
    defaultValues: {
      name: "",
      level: undefined,
      age: undefined,
      initialNotes: "",
      equipment: "ski",
    },
  });

  useEffect(() => {
    if (existing) {
      form.reset({
        name: existing.name,
        level: existing.level,
        age: existing.age ?? undefined,
        initialNotes: existing.initialNotes ?? "",
        equipment: existing.equipment,
      });
    }
  }, [existing, form]);

  const rec = useVoiceRecording({
    hints: () => VOICE_HINTS,
    onResult: async (result) => {
      // Only the words matter here; don't keep the audio.
      void deleteAudio(result.fileName);
      const transcript = result.transcript.trim();
      if (!transcript) {
        toast({
          title: "Didn't catch that",
          description: "No words were recognized. Try again, or fill in the form below.",
          variant: "destructive",
        });
        return;
      }
      setHeard(transcript);
      const { parsed, byAi } = await understandDescription(transcript);
      if (parsed.name && parsed.level) {
        const skier = await createSkier(
          getServices().db,
          {
            name: parsed.name,
            level: parsed.level,
            age: parsed.age,
            initialNotes: parsed.notes,
            equipment: parsed.equipment ?? form.getValues("equipment"),
          },
          photo,
        );
        afterLocalWrite();
        toast({
          title: `${skier.name} added`,
          description: [
            parsed.level,
            (parsed.equipment ?? form.getValues("equipment")) === "snowboard" ? "snowboard" : "skis",
            parsed.age ? `age ${parsed.age}` : null,
            byAi ? null : "understood on this phone, check the details",
          ]
            .filter(Boolean)
            .join(" · "),
        });
        setLocation(`/skier/${skier.id}`);
        return;
      }
      // Not enough to save: fill in what we got and let the coach finish.
      form.reset({
        name: parsed.name ?? "",
        level: parsed.level ?? undefined,
        age: parsed.age ?? undefined,
        initialNotes: parsed.notes ?? "",
        equipment: parsed.equipment ?? form.getValues("equipment"),
      });
      const missing = [!parsed.name && "name", !parsed.level && "skill level"].filter(Boolean).join(" and ");
      toast({ title: "Almost there", description: `Couldn't tell the ${missing}. Fill it in and tap Add Skier.` });
    },
  });

  // Saved on the phone immediately; uploads whenever there's signal.
  const onSubmit = async (data: SkierForm) => {
    const input = {
      name: data.name.trim(),
      level: data.level,
      age: data.age ?? null,
      initialNotes: data.initialNotes?.trim() || null,
      equipment: data.equipment,
    };
    if (skierId) {
      await updateSkier(getServices().db, skierId, input);
      afterLocalWrite();
      toast({ title: "Changes saved" });
      setLocation(`/skier/${skierId}`);
    } else {
      const skier = await createSkier(getServices().db, input, photo);
      afterLocalWrite();
      toast({ title: `${skier.name} added` });
      setLocation("/");
    }
  };

  const goBack = () => {
    setLocation(skierId ? `/skier/${skierId}` : "/");
  };

  return (
    <div className="min-h-screen bg-neutral-50 safe-top">
      <div className="p-4">
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-center space-x-4 mb-6">
            <button
              onClick={goBack}
              className="p-2 rounded-full hover:bg-neutral-100 transition-colors"
              aria-label="Back"
            >
              <ArrowLeft className="text-neutral-600" size={20} />
            </button>
            <h2 className="text-lg font-medium text-neutral-800">{editing ? "Edit Skier" : "Add New Skier"}</h2>
          </div>

          {!editing && (
            <div className="mb-6 rounded-xl border border-neutral-200 p-4">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={rec.toggle}
                  disabled={rec.busy}
                  aria-label={rec.recording ? "Stop recording" : "Describe the skier by voice"}
                  className={cn(
                    "w-16 h-16 shrink-0 rounded-full shadow-lg flex items-center justify-center transition-colors",
                    rec.recording ? "bg-red-500 animate-pulse" : "bg-accent",
                    rec.busy && "opacity-60",
                  )}
                >
                  {rec.recording ? <Square className="text-white" size={26} /> : <Mic className="text-white" size={30} />}
                </button>
                <div className="min-w-0">
                  <h3 className="font-medium text-neutral-800">Add by voice</h3>
                  <p className="text-sm text-neutral-600">
                    {rec.phase === "idle" && "Say their name, age, level and how to spot them."}
                    {rec.phase === "starting" && "Starting…"}
                    {rec.recording && `Listening ${formatDuration(rec.elapsed)} · tap to finish`}
                    {rec.phase === "saving" && "Understanding…"}
                  </p>
                </div>
              </div>
              {rec.phase === "idle" && !heard && (
                <p className="mt-3 text-xs text-neutral-500">
                  e.g. "Lisa is 25. She's an intermediate skier, and you can spot her by her bright red jacket."
                </p>
              )}
              {(rec.recording || heard) && (
                <p className="mt-3 bg-neutral-50 rounded-lg p-3 text-sm text-neutral-800">
                  {rec.recording ? rec.liveText || "Listening…" : `Heard: "${heard}"`}
                </p>
              )}
            </div>
          )}

          {!editing && (
            <div className="mb-6 flex items-center gap-4">
              <SkierPhotoCircle
                name="new skier"
                src={photo?.photo ?? null}
                size={88}
                onChange={setPhoto}
                onRemove={() => setPhoto(null)}
              />
              <p className="text-sm text-neutral-600">
                Photo (optional). Tap the circle to take or choose one.
              </p>
            </div>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="block text-sm font-medium text-neutral-700">Full Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter skier's full name" {...field} className={inputClass} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="equipment"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="block text-sm font-medium text-neutral-700">Rides</FormLabel>
                    <EquipmentToggle value={field.value} onChange={field.onChange} />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="level"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="block text-sm font-medium text-neutral-700">Skill Level</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className={inputClass}>
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
                    <FormLabel className="block text-sm font-medium text-neutral-700">Age (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="Age"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                        value={field.value || ""}
                        className={inputClass}
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
                    <FormLabel className="block text-sm font-medium text-neutral-700">Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Any initial notes about this skier..."
                        rows={3}
                        {...field}
                        value={field.value || ""}
                        className={inputClass}
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
                  {form.formState.isSubmitting ? "Saving..." : editing ? "Save Changes" : "Add Skier"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
