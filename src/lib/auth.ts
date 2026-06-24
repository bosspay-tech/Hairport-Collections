import { supabase } from "@/lib/supabase/client";

export const signUp = (email: string, password: string) =>
  supabase.auth.signUp({ email, password });

export const signIn = (email: string, password: string) =>
  supabase.auth.signInWithPassword({ email, password });

export const signOut = async () => {
  await supabase.auth.signOut();
};
