-- Fix corrupted progress data with invalid dates
-- Run this script to clean up existing corrupted data

BEGIN;

-- Create a temporary function to check if a date is valid
CREATE OR REPLACE FUNCTION is_valid_date(input_date TIMESTAMP WITH TIME ZONE)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if year is reasonable (between 1900 and 2100)
    RETURN EXTRACT(YEAR FROM input_date) BETWEEN 1900 AND 2100;
EXCEPTION
    WHEN OTHERS THEN
        RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Find and display corrupted records first
SELECT
    id,
    card_id,
    user_id,
    interval,
    ease_factor,
    repetitions,
    last_reviewed,
    next_review,
    EXTRACT(YEAR FROM next_review) as next_review_year
FROM card_progress
WHERE NOT is_valid_date(next_review)
   OR NOT is_valid_date(last_reviewed)
   OR interval > 730  -- More than 2 years
   OR interval < 1
   OR ease_factor > 3.0
   OR ease_factor < 1.3
   OR repetitions > 100
   OR repetitions < 0;

-- Fix corrupted intervals and ease factors
UPDATE card_progress
SET
    interval = CASE
        WHEN interval > 730 THEN 365
        WHEN interval < 1 THEN 1
        ELSE interval
    END,
    ease_factor = CASE
        WHEN ease_factor > 3.0 THEN 3.0
        WHEN ease_factor < 1.3 THEN 1.3
        ELSE ease_factor
    END,
    repetitions = CASE
        WHEN repetitions > 100 THEN 100
        WHEN repetitions < 0 THEN 0
        ELSE repetitions
    END
WHERE interval > 730
   OR interval < 1
   OR ease_factor > 3.0
   OR ease_factor < 1.3
   OR repetitions > 100
   OR repetitions < 0;

-- Fix corrupted next_review dates
UPDATE card_progress
SET next_review = CASE
    WHEN NOT is_valid_date(next_review) THEN
        last_reviewed + (interval || ' days')::INTERVAL
    WHEN EXTRACT(YEAR FROM next_review) > 2100 THEN
        CURRENT_TIMESTAMP + '365 days'::INTERVAL
    ELSE next_review
END
WHERE NOT is_valid_date(next_review)
   OR EXTRACT(YEAR FROM next_review) > 2100;

-- Fix corrupted last_reviewed dates
UPDATE card_progress
SET last_reviewed = CURRENT_TIMESTAMP
WHERE NOT is_valid_date(last_reviewed);

-- Recalculate next_review for any remaining invalid dates
UPDATE card_progress
SET next_review = last_reviewed + (LEAST(interval, 365) || ' days')::INTERVAL
WHERE NOT is_valid_date(next_review);

-- Clean up the temporary function
DROP FUNCTION is_valid_date(TIMESTAMP WITH TIME ZONE);

-- Add constraints to prevent future corruption
ALTER TABLE card_progress
ADD CONSTRAINT check_interval_bounds
CHECK (interval >= 1 AND interval <= 730);

ALTER TABLE card_progress
ADD CONSTRAINT check_ease_factor_bounds
CHECK (ease_factor >= 1.3 AND ease_factor <= 3.0);

ALTER TABLE card_progress
ADD CONSTRAINT check_repetitions_bounds
CHECK (repetitions >= 0 AND repetitions <= 100);

-- Verify the fix
SELECT
    COUNT(*) as total_records,
    COUNT(CASE WHEN interval BETWEEN 1 AND 730 THEN 1 END) as valid_intervals,
    COUNT(CASE WHEN ease_factor BETWEEN 1.3 AND 3.0 THEN 1 END) as valid_ease_factors,
    COUNT(CASE WHEN repetitions BETWEEN 0 AND 100 THEN 1 END) as valid_repetitions,
    COUNT(CASE WHEN EXTRACT(YEAR FROM next_review) BETWEEN 1900 AND 2100 THEN 1 END) as valid_next_review_dates,
    COUNT(CASE WHEN EXTRACT(YEAR FROM last_reviewed) BETWEEN 1900 AND 2100 THEN 1 END) as valid_last_reviewed_dates
FROM card_progress;

COMMIT;