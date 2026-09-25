import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Meta from 'gi://Meta';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Workspace from 'resource:///org/gnome/shell/ui/workspace.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

const BACKGROUND_SCHEMA = 'org.gnome.desktop.background';

export default class DeskflowWallpapersExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._bgSettings = new Gio.Settings({ schema_id: BACKGROUND_SCHEMA });
        
        this._origPictureUri = this._bgSettings.get_string('picture-uri');
        this._origPictureUriDark = this._bgSettings.get_string('picture-uri-dark');
        
        const ext = this;
        const workspaceManager = global.workspace_manager;
        
        workspaceManager.connectObject(
            'notify::n-workspaces', () => this._onWorkspacesCountChanged(),
            'active-workspace-changed', () => this._onActiveWorkspaceChanged(),
            'workspaces-reordered', () => this._onWorkspacesCountChanged(),
            this
        );
        
        this._onWorkspacesCountChanged();
        
        this._origWorkspaceInit = Workspace.Workspace.prototype._init;
        Workspace.Workspace.prototype._init = function(metaWorkspace, monitorIndex, overviewAdjustment) {
            ext._origWorkspaceInit.call(this, metaWorkspace, monitorIndex, overviewAdjustment);
            
            try {
                if (metaWorkspace && this._background) {
                    let wsIndex = metaWorkspace.index();
                    let uri = ext._getUri(wsIndex);
                    
                    if (uri) {
                        let overlay = new St.Widget({
                            style_class: 'workspace-background',
                            style: `background-image: url("${uri}"); background-size: cover; background-position: center; border-radius: 14px;`,
                            x_expand: true,
                            y_expand: true,
                        });
                        this._background.add_child(overlay);
                        
                        // Save reference to update on change
                        if (!ext._workspaceOverlays) ext._workspaceOverlays = [];
                        ext._workspaceOverlays.push({
                            widget: overlay,
                            wsIndex: wsIndex
                        });
                        
                        overlay.connect('destroy', () => {
                            ext._workspaceOverlays = ext._workspaceOverlays.filter(o => o.widget !== overlay);
                        });
                    }
                }
            } catch (e) {
                console.error('DeskflowWallpapers overview patch error:', e);
            }
        };

        this._indicator = null;
        this._settings.connectObject(
            'changed::show-indicator', () => this._updateIndicatorVisibility(),
            'changed::wallpapers-map', () => this._refreshAllBackgrounds(),
            this
        );
        this._updateIndicatorVisibility();

        this._onActiveWorkspaceChanged();
    }
    
    disable() {
        global.workspace_manager.disconnectObject(this);
        this._settings.disconnectObject(this);
        
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
        
        if (this._origWorkspaceInit) {
            Workspace.Workspace.prototype._init = this._origWorkspaceInit;
            this._origWorkspaceInit = null;
        }
        
        if (this._workspaceOverlays) {
            this._workspaceOverlays.forEach(o => {
                if (o.widget) o.widget.destroy();
            });
            this._workspaceOverlays = [];
        }
        
        if (this._origPictureUri) {
            this._bgSettings.set_string('picture-uri', this._origPictureUri);
        }
        if (this._origPictureUriDark) {
            this._bgSettings.set_string('picture-uri-dark', this._origPictureUriDark);
        }
        
        this._settings = null;
        this._bgSettings = null;
        this._origPictureUri = null;
        this._origPictureUriDark = null;
    }

    _getUri(wsIndex) {
        const mapStr = this._settings.get_string('wallpapers-map');
        let map = {};
        try {
            if (mapStr) map = JSON.parse(mapStr);
        } catch (e) { }
        
        let uri = map[wsIndex];
        if (!uri || uri === "") {
            uri = this._settings.get_string('default-wallpaper');
        }
        
        if (!uri || uri === "") {
            uri = this._origPictureUri;
        }
        
        return uri;
    }

    _bgStyle() {
        return this._bgSettings.get_enum('picture-options');
    }

    // Refresh all current backgrounds if the user changed them in settings
    _refreshAllBackgrounds() {
        const workspaceManager = global.workspace_manager;
        const activeIndex = workspaceManager.get_active_workspace_index();
        this._onActiveWorkspaceChanged();
        
        // Update thumbnails in Overview
        if (this._workspaceOverlays) {
            for (let overlayObj of this._workspaceOverlays) {
                let uri = this._getUri(overlayObj.wsIndex);
                if (uri && overlayObj.widget) {
                    overlayObj.widget.style = `background-image: url("${uri}"); background-size: cover; background-position: center; border-radius: 14px;`;
                }
            }
        }
    }
    
    _onWorkspacesCountChanged() {
        const workspaceManager = global.workspace_manager;
        const count = workspaceManager.get_n_workspaces();
        this._settings.set_int('workspace-count', count);
        if (this._indicator) {
            this._updateIndicatorMenu();
        }
    }
    
    _onActiveWorkspaceChanged() {
        const workspaceManager = global.workspace_manager;
        const activeIndex = workspaceManager.get_active_workspace_index();
        const uri = this._getUri(activeIndex);
        
        if (uri) {
            const file = Gio.File.new_for_commandline_arg(uri);
            if (file.query_exists(null)) {
                const style = this._bgStyle();
                
                // Update Layout Manager background actors directly to avoid 'bg-changed' event
                if (Main.layoutManager._bgManagers) {
                    for (const bgManager of Main.layoutManager._bgManagers) {
                        if (bgManager.backgroundActor && bgManager.backgroundActor.content) {
                            const bg = bgManager.backgroundActor.content.background;
                            if (bg) bg.set_file(file, style);
                        }
                    }
                }
                
                // Update GSettings
                this._writeGSettings(uri);
            }
        }
        
        if (this._indicator) {
            this._updateIndicatorMenu();
        }
    }

    _writeGSettings(uri) {
        this._bgSettings.set_string('picture-uri', uri);
        this._bgSettings.set_string('picture-uri-dark', uri);
    }
    
    _updateIndicatorVisibility() {
        const show = this._settings.get_boolean('show-indicator');
        if (show) {
            if (!this._indicator) {
                this._indicator = new PanelMenu.Button(0.0, this.metadata.name, false);
                const icon = new St.Icon({
                    icon_name: 'preferences-desktop-wallpaper-symbolic',
                    style_class: 'system-status-icon'
                });
                this._indicator.add_child(icon);
                Main.panel.addToStatusArea(this.uuid, this._indicator);
                this._updateIndicatorMenu();
            }
        } else {
            if (this._indicator) {
                this._indicator.destroy();
                this._indicator = null;
            }
        }
    }
    
    _updateIndicatorMenu() {
        if (!this._indicator) return;
        
        this._indicator.menu.removeAll();
        
        const workspaceManager = global.workspace_manager;
        const activeIndex = workspaceManager.get_active_workspace_index();
        const count = workspaceManager.get_n_workspaces();
        
        const header = new PopupMenu.PopupMenuItem(`Workspace ${activeIndex + 1} of ${count}`, { reactive: false });
        header.label.add_style_class_name('bold');
        this._indicator.menu.addMenuItem(header);
        
        this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        
        const settingsItem = new PopupMenu.PopupMenuItem('Wallpaper Settings...');
        settingsItem.connect('activate', () => {
            this.openPreferences();
        });
        this._indicator.menu.addMenuItem(settingsItem);
    }
}
