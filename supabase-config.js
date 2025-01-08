import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://fmxbhdjsynadxhuuanax.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZteGJoZGpzeW5hZHhodXVhbmF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzYyNjY1MTQsImV4cCI6MjA1MTg0MjUxNH0.rrcUX19NRsIiLpCAaMT2YE2lP5FSp7qRJ5vC-guWsZs'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)