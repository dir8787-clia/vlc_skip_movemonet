-- Skip Timestamp Manager for VLC Media Player 3.0+
-- Allows managing skip timestamps for individual videos in playlists

-- Configuration
local config = {
    rules_dir = vlc.config.datadir() .. "/skip_timestamps",  -- Directory to store rules files
    check_interval = 500,  -- Check interval in milliseconds (0.5 seconds)
    time_tolerance = 1,    -- Tolerance in seconds for skip detection
    max_skip_attempts = 3  -- Max attempts to skip to prevent infinite loops
}

-- Global variables
local dialog = nil
local playlist_items = {}
local current_rules = {}
local current_playlist_uri = nil
local current_video_uri = nil
local skip_check_timer = nil
local skip_attempts = {}  -- Track skip attempts to prevent infinite loops

-- Create rules directory if it doesn't exist
local function ensure_rules_dir()
    local success, err = vlc.umask_dir(config.rules_dir, "700")
    if not success then
        vlc.msg.err("Failed to create rules directory: " .. err)
    end
end

-- JSON serialization/deserialization functions for compatibility
local function json_encode(obj)
    local function serialize(o)
        if type(o) == "number" then
            return tostring(o)
        elseif type(o) == "string" then
            -- Simple string escaping (not full JSON escaping for compatibility)
            local escaped = string.gsub(o, '"', '\\"')
            return '"' .. escaped .. '"'
        elseif type(o) == "boolean" then
            return tostring(o)
        elseif type(o) == "table" then
            local result = "{"
            local first = true
            for k, v in pairs(o) do
                if not first then
                    result = result .. ","
                end
                result = result .. '["' .. tostring(k) .. '"]:' .. serialize(v)
                first = false
            end
            result = result .. "}"
            return result
        else
            return 'null'
        end
    end
    return serialize(obj)
end

local function json_decode(str)
    if type(str) ~= "string" or str == "" then
        return nil
    end
    
    -- Use loadstring to safely evaluate the JSON-like string
    local chunk, err = loadstring("return " .. str)
    if not chunk then
        vlc.msg.err("JSON decode error: " .. err)
        return nil
    end
    
    local success, result = pcall(chunk)
    if not success then
        vlc.msg.err("JSON decode error: " .. result)
        return nil
    end
    
    return result
end

-- Convert seconds to HH:MM:SS format
local function seconds_to_hms(seconds)
    if not seconds or seconds < 0 then
        return "00:00:00"
    end
    
    local h = math.floor(seconds / 3600)
    local m = math.floor((seconds % 3600) / 60)
    local s = math.floor(seconds % 60)
    
    return string.format("%02d:%02d:%02d", h, m, s)
end

-- Convert HH:MM:SS or MM:SS format to seconds
local function hms_to_seconds(time_str)
    if not time_str or time_str == "" then
        return 0
    end
    
    -- Try to parse as seconds first
    local num = tonumber(time_str)
    if num then
        return num
    end
    
    -- Parse as HH:MM:SS or MM:SS
    local parts = {}
    for part in string.gmatch(time_str, "[%d]+") do
        table.insert(parts, tonumber(part))
    end
    
    if #parts == 3 then  -- HH:MM:SS
        return parts[1] * 3600 + parts[2] * 60 + parts[3]
    elseif #parts == 2 then  -- MM:SS
        return parts[1] * 60 + parts[2]
    else
        return 0
    end
end

-- Get rules file path for a playlist
local function get_rules_file_path(playlist_uri)
    if not playlist_uri then
        return nil
    end
    
    local playlist_name = string.gsub(playlist_uri, ".*[/\\]", "")
    if playlist_name == "" then
        return nil
    end
    
    return config.rules_dir .. "/" .. playlist_name .. ".vlcskip"
end

-- Load rules from file
local function load_rules(playlist_uri)
    local rules_file = get_rules_file_path(playlist_uri)
    if not rules_file then
        return {}
    end
    
    local file = io.open(rules_file, "r")
    if not file then
        vlc.msg.dbg("Rules file not found: " .. rules_file)
        return {}
    end
    
    local content = file:read("*all")
    file:close()
    
    if not content or content == "" then
        return {}
    end
    
    local rules = json_decode(content)
    if not rules then
        vlc.msg.err("Failed to parse rules file: " .. rules_file)
        return {}
    end
    
    return rules
end

-- Save rules to file
local function save_rules(playlist_uri, rules)
    local rules_file = get_rules_file_path(playlist_uri)
    if not rules_file then
        return false
    end
    
    local content = json_encode(rules)
    local file = io.open(rules_file, "w")
    if not file then
        vlc.msg.err("Failed to open rules file for writing: " .. rules_file)
        return false
    end
    
    file:write(content)
    file:close()
    
    vlc.msg.dbg("Rules saved to: " .. rules_file)
    return true
end

-- Update playlist items in the dialog
local function update_playlist_display()
    if not dialog then
        return
    end
    
    -- Clear existing items
    dialog:del_list("video_list")
    
    -- Add playlist items
    for i, item in ipairs(playlist_items) do
        dialog:add_value("video_list", item.title, i)
    end
end

-- Update timestamp display for selected video
local function update_timestamp_display(video_uri)
    if not dialog then
        return
    end
    
    -- Clear existing timestamp items
    dialog:del_list("timestamp_list")
    
    if not video_uri or not current_rules[video_uri] then
        return
    end
    
    -- Add timestamps for the selected video
    for i, ts in ipairs(current_rules[video_uri]) do
        local start_time = seconds_to_hms(ts.start)
        local duration = seconds_to_hms(ts.duration)
        local item_text = string.format("%s - %s (Duration: %s)", start_time, seconds_to_hms(ts.start + ts.duration), duration)
        dialog:add_value("timestamp_list", item_text, i)
    end
end

-- Add new timestamp rule
local function add_timestamp()
    if not dialog then
        return
    end
    
    local start_time_str = dialog:get_text("start_time")
    local duration_str = dialog:get_text("duration")
    
    if not start_time_str or start_time_str == "" or not duration_str or duration_str == "" then
        dialog:info("Please enter both start time and duration", "Missing Information")
        return
    end
    
    local start_time = hms_to_seconds(start_time_str)
    local duration = hms_to_seconds(duration_str)
    
    if duration <= 0 then
        dialog:info("Duration must be greater than 0", "Invalid Duration")
        return
    end
    
    -- Get selected video
    local selected_video_idx = dialog:get_value("video_list")
    if not selected_video_idx or selected_video_idx == 0 then
        dialog:info("Please select a video first", "No Video Selected")
        return
    end
    
    local video_uri = playlist_items[selected_video_idx].uri
    if not video_uri then
        dialog:info("Invalid video selection", "Error")
        return
    end
    
    -- Initialize video rules if not exists
    if not current_rules[video_uri] then
        current_rules[video_uri] = {}
    end
    
    -- Add new timestamp rule
    table.insert(current_rules[video_uri], {
        start = start_time,
        duration = duration
    })
    
    -- Sort timestamps by start time
    table.sort(current_rules[video_uri], function(a, b) return a.start < b.start end)
    
    -- Update display
    update_timestamp_display(video_uri)
    
    dialog:info("Timestamp added successfully", "Success")
end

-- Remove selected timestamp
local function remove_timestamp()
    if not dialog then
        return
    end
    
    local selected_ts_idx = dialog:get_value("timestamp_list")
    if not selected_ts_idx or selected_ts_idx == 0 then
        dialog:info("Please select a timestamp to remove", "No Selection")
        return
    end
    
    -- Get selected video
    local selected_video_idx = dialog:get_value("video_list")
    if not selected_video_idx or selected_video_idx == 0 then
        dialog:info("Please select a video first", "No Video Selected")
        return
    end
    
    local video_uri = playlist_items[selected_video_idx].uri
    if not video_uri or not current_rules[video_uri] or not current_rules[video_uri][selected_ts_idx] then
        dialog:info("Invalid selection", "Error")
        return
    end
    
    -- Remove the timestamp
    table.remove(current_rules[video_uri], selected_ts_idx)
    
    -- Update display
    update_timestamp_display(video_uri)
    
    dialog:info("Timestamp removed successfully", "Success")
end

-- Save current rules
local function save_current_rules()
    if not current_playlist_uri then
        dialog:info("No active playlist to save rules for", "No Playlist")
        return
    end
    
    if save_rules(current_playlist_uri, current_rules) then
        dialog:info("Rules saved successfully", "Success")
    else
        dialog:info("Failed to save rules", "Error")
    end
end

-- Load rules for current playlist
local function load_current_rules()
    if not current_playlist_uri then
        dialog:info("No active playlist to load rules for", "No Playlist")
        return
    end
    
    current_rules = load_rules(current_playlist_uri)
    dialog:info("Rules loaded successfully", "Success")
    
    -- Update display if a video is selected
    local selected_video_idx = dialog:get_value("video_list")
    if selected_video_idx and selected_video_idx > 0 then
        local video_uri = playlist_items[selected_video_idx].uri
        update_timestamp_display(video_uri)
    end
end

-- Apply rules and close dialog
local function apply_and_close()
    save_current_rules()
    if dialog then
        dialog:delete()
        dialog = nil
    end
end

-- Close dialog without saving
local function close_dialog()
    if dialog then
        dialog:delete()
        dialog = nil
    end
end

-- Check if current time should be skipped
local function check_skip_time()
    local input = vlc.object.input()
    if not input then
        return
    end
    
    local time = vlc.var.get(input, "time")
    local length = vlc.var.get(input, "length")
    
    if not time or not length or length <= 0 then
        return
    end
    
    -- Get current video URI
    local current_input = vlc.input.item()
    if not current_input then
        return
    end
    
    local uri = current_input:uri()
    if not uri then
        return
    end
    
    -- Check if this video has skip rules
    if not current_rules[uri] then
        return
    end
    
    -- Check each timestamp rule for this video
    for _, rule in ipairs(current_rules[uri]) do
        local start_time = rule.start
        local end_time = rule.start + rule.duration
        
        -- Check if we're near the start of a skip interval
        if time >= (start_time - config.time_tolerance) and time <= (start_time + config.time_tolerance) then
            -- Prevent infinite loop by tracking skip attempts
            if not skip_attempts[uri] then
                skip_attempts[uri] = {}
            end
            
            local now = vlc.misc.mdate()
            local recent_attempts = 0
            
            -- Count attempts in the last 5 seconds
            for i = #skip_attempts[uri], 1, -1 do
                if now - skip_attempts[uri][i] < 5000000 then  -- 5 seconds in microseconds
                    recent_attempts = recent_attempts + 1
                else
                    break
                end
            end
            
            -- If too many attempts, skip this rule
            if recent_attempts >= config.max_skip_attempts then
                vlc.msg.warn("Too many skip attempts for " .. uri .. ", skipping rule")
                return
            end
            
            -- Record this skip attempt
            table.insert(skip_attempts[uri], now)
            if #skip_attempts[uri] > 10 then  -- Keep only last 10 attempts
                table.remove(skip_attempts[uri], 1)
            end
            
            -- Perform the skip
            local new_time = end_time
            if new_time >= length then
                new_time = length - 1  -- Don't skip past the end
            end
            
            vlc.var.set(input, "time", new_time)
            vlc.msg.dbg("Skipped from " .. time .. " to " .. new_time .. " for " .. uri)
            return
        end
    end
end

-- Initialize the skip checking timer
local function start_skip_checking()
    if skip_check_timer then
        skip_check_timer:stop()
    end
    
    skip_check_timer = vlc.timer.create(check_skip_time, config.check_interval)
    skip_check_timer:trigger()
end

-- Stop the skip checking timer
local function stop_skip_checking()
    if skip_check_timer then
        skip_check_timer:stop()
        skip_check_timer = nil
    end
end

-- Update current playlist
local function update_current_playlist()
    -- Get current playlist
    playlist_items = {}
    local playlist = vlc.playlist.get_items()
    
    for i, item in ipairs(playlist) do
        table.insert(playlist_items, {
            title = item:name(),
            uri = item:uri()
        })
    end
    
    -- Get current playlist URI (try to get from playlist manager)
    local current_input = vlc.input.item()
    if current_input then
        local input_uri = current_input:uri()
        if input_uri and string.find(input_uri, "%.xspf$") or string.find(input_uri, "%.m3u$") then
            current_playlist_uri = input_uri
        else
            -- If current item is not a playlist, try to find the last loaded playlist
            -- This is a limitation in VLC 3.0 - we can't always get the playlist URI directly
            current_playlist_uri = nil
        end
    end
    
    -- Load rules for current playlist if available
    if current_playlist_uri then
        current_rules = load_rules(current_playlist_uri)
    else
        current_rules = {}
    end
    
    -- Update dialog display
    if dialog then
        update_playlist_display()
    end
end

-- Create the extension dialog
function descriptor()
    return {
        title = "Skip Timestamp Manager",
        version = "1.0",
        author = "Assistant",
        url = 'https://github.com',
        shortdesc = "Manage skip timestamps for playlist videos",
        description = [[
<p>Skip Timestamp Manager allows you to define time intervals to skip for individual videos in playlists.</p>
<p>Features:</p>
<ul>
<li>Add, edit, and remove skip timestamps for videos in your playlist</li>
<li>Automatic skipping during playback</li>
<li>Save/load rules per playlist</li>
<li>Compatible with VLC 3.0+</li>
</ul>
        ]],
        capabilities = {"interface", "playlist"}
    }
end

-- Main activation function
function activate()
    -- Create rules directory
    ensure_rules_dir()
    
    -- Create the dialog
    dialog = vlc.dialog("Skip Timestamp Manager")
    
    -- Create controls
    dialog:add_label("Current Playlist:", 1, 1, 1, 1)
    dialog:add_text_input("", 2, 1, 3, 1)  -- Playlist name (read-only)
    dialog:add_button("Refresh Playlist", function() 
        update_current_playlist()
        update_playlist_display()
    end, 5, 1, 1, 1)
    
    dialog:add_label("Videos in Playlist:", 1, 2, 1, 1)
    dialog:add_list("", 2, 2, 4, 4, "video_list")  -- Video list
    
    dialog:add_label("Start Time (HH:MM:SS or seconds):", 1, 6, 2, 1)
    dialog:add_text_input("", 3, 6, 2, 1, "start_time")
    
    dialog:add_label("Duration (HH:MM:SS, MM:SS, or seconds):", 1, 7, 2, 1)
    dialog:add_text_input("", 3, 7, 2, 1, "duration")
    
    dialog:add_button("Add Timestamp", add_timestamp, 5, 6, 1, 1)
    dialog:add_button("Remove Selected", remove_timestamp, 5, 7, 1, 1)
    
    dialog:add_label("Timestamps for Selected Video:", 1, 8, 1, 1)
    dialog:add_list("", 2, 8, 4, 3, "timestamp_list")  -- Timestamp list
    
    dialog:add_button("Save Rules", save_current_rules, 1, 11, 1, 1)
    dialog:add_button("Load Rules", load_current_rules, 2, 11, 1, 1)
    dialog:add_button("Apply & Close", apply_and_close, 4, 11, 1, 1)
    dialog:add_button("Cancel", close_dialog, 5, 11, 1, 1)
    
    -- Initialize playlist
    update_current_playlist()
    update_playlist_display()
    
    -- Start skip checking
    start_skip_checking()
end

-- Deactivation function
function deactivate()
    if dialog then
        dialog:delete()
        dialog = nil
    end
    stop_skip_checking()
end

-- Close function (when dialog is closed)
function close()
    if dialog then
        dialog:delete()
        dialog = nil
    end
    stop_skip_checking()
end