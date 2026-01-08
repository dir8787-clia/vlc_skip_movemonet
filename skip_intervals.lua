-- VLC Media Player script to automatically skip intervals in videos
-- Place this file in VLC's lua/extensions directory

-- Define the extension metadata
function descriptor()
    return {
        title = "Skip Intervals Extension";
        version = "1.0";
        author = "Assistant";
        shortdesc = "Automatically skip intervals in videos";
        description = "Automatically skip predefined time intervals for specific video files";
        capabilities = { "input-listener" }
    }
end

-- Configuration: Define intervals to skip for each file
-- Format: { ["filename"] = { {start_time, duration}, ... } }
-- start_time is in HH:MM:SS format, duration is in seconds
local skip_rules = {
    ["example_video.mp4"] = {
        { "00:01:30", 60 },  -- Skip from 1:30 for 60 seconds
        { "00:05:45", 30 }   -- Skip from 5:45 for 30 seconds
    },
    ["another_video.mkv"] = {
        { "00:02:15", 45 },  -- Skip from 2:15 for 45 seconds
        { "00:10:30", 90 }   -- Skip from 10:30 for 90 seconds
    },
    ["demo.mp4"] = {
        { "00:00:30", 15 },  -- Skip from 0:30 for 15 seconds
        { "00:03:00", 120 }, -- Skip from 3:00 for 120 seconds
        { "00:07:15", 45 }   -- Skip from 7:15 for 45 seconds
    }
}

-- Helper function to convert HH:MM:SS to seconds
local function time_to_seconds(time_str)
    if not time_str then return 0 end
    local h, m, s = time_str:match("(%d+):(%d+):(%d+)")
    if h and m and s then
        return tonumber(h) * 3600 + tonumber(m) * 60 + tonumber(s)
    end
    return 0
end

-- Helper function to get just the filename from a full path
local function get_filename_from_path(path)
    if not path then return "" end
    local _, _, filename = path:match("(.-)([^/\\]*)[/\\]?$")
    return filename or path
end

-- Variable to track the current file and its skip rules
local current_file = nil
local current_skip_rules = nil
local skip_check_timer = nil
local is_skipping = false

-- Main function to check if we need to skip
local function check_and_skip()
    if not vlc.input or not vlc.input.is_playing() then
        return
    end

    local input = vlc.input.item()
    if not input then
        return
    end

    local current_path = input:uri()
    if not current_path then
        return
    end
    
    -- Convert URI to local path if needed
    local local_path = current_path
    if string.sub(current_path, 1, 7) == "file://" then
        local_path = string.sub(current_path, 8)
    end
    
    local filename = get_filename_from_path(local_path)
    
    -- Check if this is a new file
    if filename ~= current_file then
        current_file = filename
        current_skip_rules = skip_rules[filename]
        if current_skip_rules then
            vlc.msg.dbg("Found skip rules for file: " .. filename)
        else
            vlc.msg.dbg("No skip rules for file: " .. filename)
        end
    end

    -- If there are skip rules for this file, check current position
    if current_skip_rules and #current_skip_rules > 0 then
        local pos = vlc.var.get(vlc.input.get(), "time")
        if pos then
            pos = tonumber(pos)
            if pos then
                -- Check each skip rule
                for i, rule in ipairs(current_skip_rules) do
                    local start_time = time_to_seconds(rule[1])
                    local duration = tonumber(rule[2]) or 0
                    local end_time = start_time + duration
                    
                    -- Check if we're within a skip interval
                    if pos >= start_time and pos < end_time and not is_skipping then
                        is_skipping = true
                        vlc.msg.dbg(string.format("Skipping interval: %s - Jumping from %d to %d", filename, pos, end_time))
                        
                        -- Set the new position to the end of the skip interval
                        vlc.var.set(vlc.input.get(), "time", end_time)
                        
                        -- Small delay to prevent skipping loop
                        vlc.misc.mwait(vlc.misc.mdate() + 500000) -- 0.5 seconds
                        is_skipping = false
                    end
                end
            end
        end
    end
end

-- Start the extension
function activate()
    vlc.msg.dbg("Skip Intervals Extension activated")
    
    -- Create a timer that checks position every ~1 second
    skip_check_timer = vlc.timer.create(1000, function()
        check_and_skip()
    end)
    
    -- Start the timer
    skip_check_timer:resume()
end

-- Deactivate the extension
function deactivate()
    vlc.msg.dbg("Skip Intervals Extension deactivated")
    if skip_check_timer then
        skip_check_timer:stop()
        skip_check_timer = nil
    end
end

-- Handle input events
function input_changed()
    -- Reset file tracking when input changes
    current_file = nil
    current_skip_rules = nil
    is_skipping = false
end