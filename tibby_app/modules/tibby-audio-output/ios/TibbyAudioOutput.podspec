Pod::Spec.new do |s|
  s.name = 'TibbyAudioOutput'
  s.version = '0.1.0'
  s.summary = 'Phone audio output information for TIBBY'
  s.description = 'Reports AVAudioSession routes without pairing headphones inside the app.'
  s.license = { :type => 'Private' }
  s.author = 'TIBBY'
  s.homepage = 'https://github.com/ufungii/tibby-companion'
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.source = { :git => 'https://github.com/ufungii/tibby-companion.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
end
