import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class DeskflowWallpapersPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        this._settings = this.getSettings();
        
        window.set_default_size(700, 600);
        window.set_title("Deskflow Wallpapers Settings");
        
        const page = new Adw.PreferencesPage();
        
        this._workspacesGroup = new Adw.PreferencesGroup({
            title: 'Workspaces',
            description: 'Set individual wallpapers for each detected workspace.'
        });
        page.add(this._workspacesGroup);
        
        this._workspaceRows = [];
        this._updateWorkspacesList();
        
        this._settingsChangedId = this._settings.connect('changed::workspace-count', () => {
            this._updateWorkspacesList();
        });
        
        window.connect('close-request', () => {
            if (this._settings && this._settingsChangedId) {
                this._settings.disconnect(this._settingsChangedId);
                this._settingsChangedId = null;
            }
            this._settings = null;
            this._workspacesGroup = null;
            this._workspaceRows = null;
        });
        
        const extraGroup = new Adw.PreferencesGroup({
            title: 'Advanced'
        });
        page.add(extraGroup);
        
        const indicatorRow = new Adw.SwitchRow({
            title: 'Panel Indicator',
            subtitle: 'Show quick access menu in the GNOME top panel'
        });
        this._settings.bind('show-indicator', indicatorRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        extraGroup.add(indicatorRow);
        
        const delayRow = new Adw.SpinRow({
            title: 'Switch Delay (ms)',
            subtitle: 'Wait time before changing wallpaper (prevents flickering during rapid switching)',
            adjustment: new Gtk.Adjustment({ lower: 0, upper: 2000, step_increment: 50 })
        });
        this._settings.bind('switch-delay', delayRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        extraGroup.add(delayRow);
        
        window.add(page);
    }
    
    _updateWorkspacesList() {
        for (const row of this._workspaceRows) {
            this._workspacesGroup.remove(row);
        }
        this._workspaceRows = [];
        
        const count = this._settings.get_int('workspace-count');
        const mapStr = this._settings.get_string('wallpapers-map');
        let map = {};
        try { map = JSON.parse(mapStr); } catch(e) {}
        
        for (let i = 0; i < count; i++) {
            const row = new Adw.ActionRow({
                title: `Workspace ${i + 1}`,
                subtitle: map[i] ? map[i].replace('file://', '') : 'Default'
            });
            
            const pickBtn = new Gtk.Button({
                icon_name: 'document-open-symbolic',
                valign: Gtk.Align.CENTER,
                tooltip_text: 'Select Wallpaper',
                css_classes: ['flat']
            });
            pickBtn.connect('clicked', () => this._chooseWallpaper(i, row));
            row.add_suffix(pickBtn);
            
            const clearBtn = new Gtk.Button({
                icon_name: 'edit-clear-symbolic',
                valign: Gtk.Align.CENTER,
                tooltip_text: 'Reset Wallpaper',
                css_classes: ['flat']
            });
            clearBtn.connect('clicked', () => {
                const currentMapStr = this._settings.get_string('wallpapers-map');
                let currentMap = {};
                try { currentMap = JSON.parse(currentMapStr); } catch(e) {}
                delete currentMap[i];
                this._settings.set_string('wallpapers-map', JSON.stringify(currentMap));
                row.set_subtitle('Default');
            });
            row.add_suffix(clearBtn);
            
            this._workspacesGroup.add(row);
            this._workspaceRows.push(row);
        }
    }
    
    _chooseWallpaper(index, row) {
        const dialog = new Gtk.FileDialog({
            title: `Select wallpaper for Workspace ${index + 1}`
        });
        
        const filter = new Gtk.FileFilter();
        filter.set_name('Images');
        filter.add_mime_type('image/png');
        filter.add_mime_type('image/jpeg');
        filter.add_mime_type('image/webp');
        filter.add_mime_type('image/svg+xml');
        
        const filters = Gio.ListStore.new(Gtk.FileFilter);
        filters.append(filter);
        dialog.set_filters(filters);
        
        const window = row.get_root();
        
        dialog.open(window, null, (source, res) => {
            try {
                const file = source.open_finish(res);
                if (file) {
                    const uri = file.get_uri();
                    const currentMapStr = this._settings.get_string('wallpapers-map');
                    let currentMap = {};
                    try { currentMap = JSON.parse(currentMapStr); } catch(e) {}
                    
                    currentMap[index] = uri;
                    this._settings.set_string('wallpapers-map', JSON.stringify(currentMap));
                    row.set_subtitle(uri.replace('file://', ''));
                }
            } catch (e) {
                // Cancelled or an error occurred
            }
        });
    }
}
