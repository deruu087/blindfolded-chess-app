-- Create custom_games table for storing user-created chess games
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS custom_games (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    game_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create index on user_id for faster queries
CREATE INDEX IF NOT EXISTS idx_custom_games_user_id ON custom_games(user_id);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_custom_games_created_at ON custom_games(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE custom_games ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only see their own custom games
CREATE POLICY "Users can view their own custom games"
    ON custom_games FOR SELECT
    USING (auth.uid() = user_id);

-- Create policy: Users can insert their own custom games
CREATE POLICY "Users can insert their own custom games"
    ON custom_games FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Create policy: Users can update their own custom games
CREATE POLICY "Users can update their own custom games"
    ON custom_games FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Create policy: Users can delete their own custom games
CREATE POLICY "Users can delete their own custom games"
    ON custom_games FOR DELETE
    USING (auth.uid() = user_id);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_custom_games_updated_at
    BEFORE UPDATE ON custom_games
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Verify the table was created
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'custom_games'
ORDER BY ordinal_position;

