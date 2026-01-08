-- VLC Media Player Extension: Skip Timestamps
-- Allows managing and automatically skipping timestamp ranges for videos in playlists
-- Configuration is saved/loaded per playlist with .vlcskip extension

-- Configuration
local config = {
    rules_directory = vlc.config.configdir() .. "/vlcskip",  -- Default directory for rules
    check_interval = 500,  -- Check every 500ms
    time_tolerance = 1,    -- 1 second tolerance for skip triggers
}

-- Global variables
local active_dialog = nil
local current_playlist_uri = nil
local current_playlist_items = {}
local current_rules = {}  -- Rules for the current playlist: { [uri] = { {start_time, duration}, ... } }
local skip_check_timer = nil
local is_extension_active = false

-- Utility functions

-- Convert time string (HH:MM:SS or MM:SS) to seconds
local function time_to_seconds(time_str)
    if not time_str or time_str == "" then return 0 end
    
    local parts = {}
    for part in string.gmatch(time_str, "([^:]+)") do
        table.insert(parts, tonumber(part) or 0)
    end
    
    if #parts == 3 then  -- HH:MM:SS
        return parts[1] * 3600 + parts[2] * 60 + parts[3]
    elseif #parts == 2 then  -- MM:SS
        return parts[1] * 60 + parts[2]
    else  -- Treat as seconds
        return tonumber(time_str) or 0
    end
end

-- Convert seconds to time string (HH:MM:SS)
local function seconds_to_time(seconds)
    seconds = math.floor(seconds)
    local h = math.floor(seconds / 3600)
    local m = math.floor((seconds % 3600) / 60)
    local s = seconds % 60
    return string.format("%02d:%02d:%02d", h, m, s)
end

-- Get playlist file name without extension
local function get_playlist_name(uri)
    if not uri then return nil end
    
    -- Remove protocol part if present
    local clean_uri = string.gsub(uri, "^%w+://", "")
    
    -- Get the filename
    local filename = string.match(clean_uri, "([^/\\]+)$")
    if not filename then return nil end
    
    -- Remove extension
    local name = string.gsub(filename, "%.[^.]*$", "")
    return name
end

-- Get playlist extension
local function get_playlist_extension(uri)
    if not uri then return nil end
    
    local clean_uri = string.gsub(uri, "^%w+://", "")
    local ext = string.match(clean_uri, "%.([^./\\]+)$")
    return ext
end

-- Get rules file path for a playlist
local function get_rules_file_path(playlist_uri)
    if not playlist_uri then return nil end
    
    local playlist_name = get_playlist_name(playlist_uri)
    if not playlist_name then return nil end
    
    local ext = get_playlist_extension(playlist_uri)
    if not ext then return nil end
    
    return config.rules_directory .. "/" .. playlist_name .. "." .. ext .. ".vlcskip"
end

-- Load rules from JSON file
local function load_rules(playlist_uri)
    local rules_file = get_rules_file_path(playlist_uri)
    if not rules_file then return {} end
    
    local file = io.open(rules_file, "r")
    if not file then return {} end
    
    local content = file:read("*all")
    file:close()
    
    if not content or content == "" then return {} end
    
    -- Attempt to parse as JSON
    local success, result = pcall(vlc.utils.parse_json, content)
    if success then
        return result
    else
        -- If JSON parsing fails, try alternative format
        return {}
    end
end

-- Save rules to JSON file
local function save_rules(playlist_uri, rules)
    local rules_file = get_rules_file_path(playlist_uri)
    if not rules_file then return false end
    
    -- Create directory if it doesn't exist
    local dir = string.match(rules_file, "(.+)/[^/]*$") or "."
    vlc.utils.make_directory(dir, 0755)
    
    local file = io.open(rules_file, "w")
    if not file then return false end
    
    -- Convert rules to JSON
    local json_str = vlc.utils.to_json(rules)
    if not json_str then 
        file:close()
        return false
    end
    
    file:write(json_str)
    file:close()
    return true
end

-- Check if current time falls within any skip range
local function check_and_skip()
    if not is_extension_active then return end
    
    local input = vlc.object.input()
    if not input then return end
    
    local time = vlc.var.get(input, "time")
    local length = vlc.var.get(input, "length")
    if not time or not length or length <= 0 then return end
    
    -- Get current media URI
    local item = vlc.playlist.current()
    if not item then return end
    
    local uri = item.uri
    if not uri then return end
    
    -- Check if we have rules for this URI
    if not current_rules[uri] then return end
    
    for _, rule in ipairs(current_rules[uri]) do
        local start_time = rule[1]
        local duration = rule[2]
        local end_time = start_time + duration
        
        -- Check if we're within the skip range (with tolerance)
        if time >= start_time - config.time_tolerance and time <= end_time + config.time_tolerance then
            -- Check if we're close to the start time to trigger the skip
            if time >= start_time - config.time_tolerance and time <= start_time + config.time_tolerance then
                vlc.var.set(input, "time", end_time)
                vlc.msg.dbg("Skipped from " .. seconds_to_time(start_time) .. " to " .. seconds_to_time(end_time))
            end
        end
    end
end

-- Update playlist information
local function update_playlist_info()
    -- Get current playlist
    local playlist = vlc.object.playlist()
    if not playlist then return end
    
    -- Get current playlist URI
    current_playlist_uri = nil
    local items = vlc.playlist.get_items()
    if items and #items > 0 then
        -- Try to find the playlist URI by checking if any item is a playlist
        for _, item in ipairs(items) do
            local uri = item.uri
            if uri then
                local ext = string.match(uri, "%.([^./\\]+)$")
                if ext and (ext == "xspf" or ext == "m3u" or ext == "m3u8") then
                    current_playlist_uri = uri
                    break
                end
            end
        end
    end
    
    -- If we couldn't find a playlist URI, use the first item as reference
    if not current_playlist_uri and items and #items > 0 then
        current_playlist_uri = items[1].uri
    end
    
    -- Get all playlist items
    current_playlist_items = items or {}
    
    -- Load rules for current playlist
    if current_playlist_uri then
        current_rules = load_rules(current_playlist_uri) or {}
    else
        current_rules = {}
    end
end

-- Initialize the extension
local function activate_extension()
    if is_extension_active then return end
    
    is_extension_active = true
    
    -- Update playlist info
    update_playlist_info()
    
    -- Start the skip check timer
    if not skip_check_timer then
        skip_check_timer = vlc.timer.create()
        skip_check_timer:set(config.check_interval, function()
            check_and_skip()
        end)
        skip_check_timer:manage()
    end
end

-- Deactivate the extension
local function deactivate_extension()
    is_extension_active = false
    
    if skip_check_timer then
        skip_check_timer:stop()
        skip_check_timer = nil
    end
end

-- Create the extension dialog
local function create_dialog()
    if active_dialog then
        active_dialog:show()  -- Show existing dialog
        return
    end
    
    -- Create dialog
    active_dialog = vlc.dialog("Skip Timestamp Manager")
    
    -- Main layout
    local main_layout = active_dialog:add_layout("vertical")
    
    -- Playlist info
    local playlist_label = main_layout:add_label("Current Playlist: Unknown", 0, 0, 2, 1)
    
    -- Video selection
    local video_layout = main_layout:add_layout("horizontal")
    local video_label = video_layout:add_label("Select Video:", 0, 0, 1, 1)
    local video_combo = video_layout:add_dropdown(1, 0, 1, 1)
    video_combo:set_width(300)
    
    -- Populate video dropdown
    for i, item in ipairs(current_playlist_items) do
        local name = item.name or item.uri or "Unknown"
        video_combo:add_value(name, i)
    end
    
    -- Timestamp list
    local list_label = main_layout:add_label("Skip Timestamps:", 0, 1, 2, 1)
    local timestamp_list = main_layout:add_list(0, 2, 2, 4)
    timestamp_list:set_width(500)
    timestamp_list:set_height(200)
    
    -- Add column headers
    timestamp_list:add_column("Start Time", 150)
    timestamp_list:add_column("Duration", 100)
    timestamp_list:add_column("End Time", 150)
    
    -- Refresh the list for the first item if available
    if #current_playlist_items > 0 then
        local selected_video_idx = video_combo:get_value()
        if selected_video_idx then
            local selected_uri = current_playlist_items[selected_video_idx].uri
            if current_rules[selected_uri] then
                for i, rule in ipairs(current_rules[selected_uri]) do
                    local start_time = seconds_to_time(rule[1])
                    local duration = seconds_to_time(rule[2])
                    local end_time = seconds_to_time(rule[1] + rule[2])
                    timestamp_list:add_value(start_time, i)
                    timestamp_list:set_data(start_time, 1, i)
                    timestamp_list:set_data(duration, 2, i)
                    timestamp_list:set_data(end_time, 3, i)
                end
            end
        end
    end
    
    -- Controls for adding/removing timestamps
    local controls_layout = main_layout:add_layout("horizontal")
    local start_time_label = controls_layout:add_label("Start Time (HH:MM:SS):", 0, 0, 1, 1)
    local start_time_input = controls_layout:add_text_input("", 1, 0, 1, 1)
    start_time_input:set_width(100)
    
    local duration_label = controls_layout:add_label("Duration (MM:SS or sec):", 2, 0, 1, 1)
    local duration_input = controls_layout:add_text_input("", 3, 0, 1, 1)
    duration_input:set_width(100)
    
    local add_button = controls_layout:add_button("Add", function()
        local selected_video_idx = video_combo:get_value()
        if not selected_video_idx then return end
        
        local selected_uri = current_playlist_items[selected_video_idx].uri
        if not selected_uri then return end
        
        local start_time_str = start_time_input:get_text()
        local duration_str = duration_input:get_text()
        
        if not start_time_str or start_time_str == "" or not duration_str or duration_str == "" then
            vlc.msg.warn("Please enter both start time and duration")
            return
        end
        
        local start_time = time_to_seconds(start_time_str)
        local duration = time_to_seconds(duration_str)
        
        if not current_rules[selected_uri] then
            current_rules[selected_uri] = {}
        end
        
        table.insert(current_rules[selected_uri], {start_time, duration})
        
        -- Refresh the list
        timestamp_list:clear()
        for i, rule in ipairs(current_rules[selected_uri]) do
            local start_time_str = seconds_to_time(rule[1])
            local duration_str = seconds_to_time(rule[2])
            local end_time_str = seconds_to_time(rule[1] + rule[2])
            timestamp_list:add_value(start_time_str, i)
            timestamp_list:set_data(start_time_str, 1, i)
            timestamp_list:set_data(duration_str, 2, i)
            timestamp_list:set_data(end_time_str, 3, i)
        end
        
        -- Clear inputs
        start_time_input:set_text("")
        duration_input:set_text("")
    end, 4, 0, 1, 1)
    
    -- Remove selected button
    local remove_button = controls_layout:add_button("Remove Selected", function()
        local selected_video_idx = video_combo:get_value()
        if not selected_video_idx then return end
        
        local selected_uri = current_playlist_items[selected_video_idx].uri
        if not selected_uri then return end
        
        local selected_row = timestamp_list:get_selection()
        if not selected_row then return end
        
        local row_idx = next(selected_row)
        if not row_idx then return end
        
        if current_rules[selected_uri] and #current_rules[selected_uri] >= row_idx then
            table.remove(current_rules[selected_uri], row_idx)
            
            -- Refresh the list
            timestamp_list:clear()
            for i, rule in ipairs(current_rules[selected_uri]) do
                local start_time_str = seconds_to_time(rule[1])
                local duration_str = seconds_to_time(rule[2])
                local end_time_str = seconds_to_time(rule[1] + rule[2])
                timestamp_list:add_value(start_time_str, i)
                timestamp_list:set_data(start_time_str, 1, i)
                timestamp_list:set_data(duration_str, 2, i)
                timestamp_list:set_data(end_time_str, 3, i)
            end
        end
    end, 5, 0, 1, 1)
    
    -- Action buttons
    local actions_layout = main_layout:add_layout("horizontal")
    local save_button = actions_layout:add_button("Save Rules", function()
        if current_playlist_uri then
            local success = save_rules(current_playlist_uri, current_rules)
            if success then
                vlc.msg.info("Rules saved successfully")
            else
                vlc.msg.err("Failed to save rules")
            end
        else
            vlc.msg.warn("No active playlist to save rules for")
        end
    end, 0, 0, 1, 1)
    
    local load_button = actions_layout:add_button("Load Rules", function()
        if current_playlist_uri then
            current_rules = load_rules(current_playlist_uri) or {}
            vlc.msg.info("Rules loaded successfully")
            
            -- Refresh the list based on currently selected video
            local selected_video_idx = video_combo:get_value()
            if selected_video_idx then
                local selected_uri = current_playlist_items[selected_video_idx].uri
                timestamp_list:clear()
                if current_rules[selected_uri] then
                    for i, rule in ipairs(current_rules[selected_uri]) do
                        local start_time_str = seconds_to_time(rule[1])
                        local duration_str = seconds_to_time(rule[2])
                        local end_time_str = seconds_to_time(rule[1] + rule[2])
                        timestamp_list:add_value(start_time_str, i)
                        timestamp_list:set_data(start_time_str, 1, i)
                        timestamp_list:set_data(duration_str, 2, i)
                        timestamp_list:set_data(end_time_str, 3, i)
                    end
                end
            end
        else
            vlc.msg.warn("No active playlist to load rules for")
        end
    end, 1, 0, 1, 1)
    
    local apply_close_button = actions_layout:add_button("Apply and Close", function()
        -- Save current rules
        if current_playlist_uri then
            save_rules(current_playlist_uri, current_rules)
        end
        active_dialog:hide()
    end, 2, 0, 1, 1)
    
    -- Update playlist label
    if current_playlist_uri then
        local playlist_name = get_playlist_name(current_playlist_uri)
        playlist_label:set_text("Current Playlist: " .. (playlist_name or "Unknown"))
    else
        playlist_label:set_text("Current Playlist: None")
    end
    
    -- Update list when video selection changes
    video_combo:connect_signal("changed", function()
        local selected_video_idx = video_combo:get_value()
        if not selected_video_idx then return end
        
        local selected_uri = current_playlist_items[selected_video_idx].uri
        if not selected_uri then return end
        
        timestamp_list:clear()
        if current_rules[selected_uri] then
            for i, rule in ipairs(current_rules[selected_uri]) do
                local start_time_str = seconds_to_time(rule[1])
                local duration_str = seconds_to_time(rule[2])
                local end_time_str = seconds_to_time(rule[1] + rule[2])
                timestamp_list:add_value(start_time_str, i)
                timestamp_list:set_data(start_time_str, 1, i)
                timestamp_list:set_data(duration_str, 2, i)
                timestamp_list:set_data(end_time_str, 3, i)
            end
        end
    end)
    
    active_dialog:show()
end

-- Callback functions for VLC extension

function descriptor()
    return {
        title = "Skip Timestamp Manager";
        version = "1.0";
        author = "Assistant";
        url = 'https://github.com';
        shortdesc = "Skip Timestamp Manager";
        description = "Manages and automatically skips timestamp ranges for videos in playlists";
        capabilities = {"input-listener"}
    }
end

function activate()
    activate_extension()
end

function deactivate()
    deactivate_extension()
end

function close()
    if active_dialog then
        active_dialog:hide()
        active_dialog = nil
    end
    deactivate_extension()
end

-- Input listener to handle playlist changes
function input_changed()
    update_playlist_info()
end

-- Menu callback (this is called when the extension is selected from the menu)
function menu()
    create_dialog()
    return {}
end