require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'SkicoachVoiceNote'
  s.version = package['version']
  s.summary = package['description']
  s.license = { :type => 'Proprietary', :text => 'Private plugin for Ski Coach AI' }
  s.homepage = 'https://github.com/'
  s.author = 'Ski Coach AI'
  s.source = { :git => 'https://github.com/', :tag => s.version.to_s }
  s.source_files = 'ios/Sources/**/*.{swift,h,m}'
  s.ios.deployment_target = '15.0'
  s.frameworks = 'AVFoundation', 'Speech'
  s.dependency 'Capacitor'
  s.swift_version = '5.9'
end
